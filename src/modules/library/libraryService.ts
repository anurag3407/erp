import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import { provisionalHallTicketService } from '../finance/provisionalHallTicket.js';
import type {
  LibraryBook,
  BookLoan,
  LibraryHallTicketClearance,
  PaymentTransaction,
  ProvisionalHallTicket,
} from '../../types/index.js';

export interface AddBookRequest {
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  callNumber: string;
  totalCopies: number;
  departmentId?: string;
}

export class LibraryService {
  private finePerDayRupees = 5.0; // ₹5 per day standard UGC/AICTE library fine
  private standardLoanPeriodDays = 14;
  private maxRenewalsAllowed = 2;

  /**
   * Add a book to the library catalog
   */
  async addBook(req: AddBookRequest): Promise<LibraryBook> {
    const bookId = `book-${crypto.randomUUID()}`;
    const book: LibraryBook = {
      id: bookId,
      isbn: req.isbn,
      title: req.title,
      author: req.author,
      publisher: req.publisher,
      callNumber: req.callNumber,
      totalCopies: req.totalCopies,
      availableCopies: req.totalCopies,
      departmentId: req.departmentId,
    };

    await db.libraryBooks.set(bookId, book);
    return book;
  }

  /**
   * Issue a book to a student
   */
  async issueBook(bookId: string, studentId: string, loanDays: number = this.standardLoanPeriodDays): Promise<BookLoan> {
    const book = await db.libraryBooks.get(bookId);
    if (!book) {
      throw new Error(`Book not found: ${bookId}`);
    }

    if (book.availableCopies <= 0) {
      throw new Error(`OUT_OF_STOCK: No copies available for book ${book.title}`);
    }

    const student = await db.studentProfiles.get(studentId);
    if (!student) {
      throw new Error(`Student not found: ${studentId}`);
    }

    const now = new Date();

    // Prevent duplicate borrowing of the same book
    const activeLoans = await db.bookLoans.values();
    const existingActiveLoan = activeLoans.find(
      (l) => l.bookId === bookId && l.studentId === studentId && l.status === 'ISSUED'
    );
    if (existingActiveLoan) {
      throw new Error(`DUPLICATE_LOAN_DISALLOWED: Student ${studentId} already has an active copy of book ${book.title}`);
    }

    // Check if student is blocked due to overdue unreturned books
    const overdueCount = activeLoans.filter(
      (l) => l.studentId === studentId && l.status === 'ISSUED' && now.getTime() > new Date(l.dueDate).getTime()
    ).length;
    if (overdueCount > 0) {
      throw new Error(`BORROWING_BLOCKED: Student ${studentId} has ${overdueCount} overdue book(s). Return them before borrowing new books.`);
    }

    const dueDate = new Date(now.getTime() + loanDays * 86400000);

    const loanId = `loan-${crypto.randomUUID()}`;
    const loan: BookLoan = {
      id: loanId,
      bookId,
      studentId,
      issuedAt: now,
      dueDate,
      renewalCount: 0,
      status: 'ISSUED',
      overdueFineAmount: 0,
    };

    book.availableCopies -= 1;
    await db.libraryBooks.set(book.id, book);
    await db.bookLoans.set(loanId, loan);

    return loan;
  }

  /**
   * Renew an issued book
   */
  async renewBook(loanId: string, extensionDays: number = 14): Promise<BookLoan> {
    const loan = await db.bookLoans.get(loanId);
    if (!loan) {
      throw new Error(`Loan record not found: ${loanId}`);
    }

    if (loan.status !== 'ISSUED') {
      throw new Error(`Cannot renew loan with status: ${loan.status}`);
    }

    if (loan.renewalCount >= this.maxRenewalsAllowed) {
      throw new Error(`MAX_RENEWALS_EXCEEDED: Maximum ${this.maxRenewalsAllowed} renewals allowed`);
    }

    const now = new Date();
    if (now.getTime() > new Date(loan.dueDate).getTime()) {
      throw new Error('OVERDUE_RENEWAL_BLOCKED: Cannot renew overdue book. Return and settle fines.');
    }

    loan.dueDate = new Date(new Date(loan.dueDate).getTime() + extensionDays * 86400000);
    loan.renewalCount += 1;
    await db.bookLoans.set(loan.id, loan);

    return loan;
  }

  /**
   * Return a book, calculate overdue fine, and connect to payment_transactions under feeHead 'LIBRARY_FINE'
   */
  async returnBook(loanId: string, returnDate: Date = new Date()): Promise<{ loan: BookLoan; fineTransaction?: PaymentTransaction }> {
    const loan = await db.bookLoans.get(loanId);
    if (!loan) {
      throw new Error(`Loan record not found: ${loanId}`);
    }

    if (loan.status === 'RETURNED') {
      throw new Error(`Book is already returned: ${loanId}`);
    }

    const book = await db.libraryBooks.get(loan.bookId);
    if (book) {
      book.availableCopies = Math.min(book.totalCopies, book.availableCopies + 1);
      await db.libraryBooks.set(book.id, book);
    }

    loan.returnedAt = returnDate;
    loan.status = 'RETURNED';

    let fineTransaction: PaymentTransaction | undefined;

    // Check overdue
    if (returnDate.getTime() > new Date(loan.dueDate).getTime()) {
      const daysOverdue = Math.ceil((returnDate.getTime() - new Date(loan.dueDate).getTime()) / 86400000);
      const fineAmount = Math.round(daysOverdue * this.finePerDayRupees * 100) / 100;
      loan.overdueFineAmount = fineAmount;

      if (fineAmount > 0) {
        // Connect to payment_transactions under feeHead 'LIBRARY_FINE'
        const txId = `tx-lib-${crypto.randomUUID()}`;
        const orderId = `order_lib_${crypto.randomUUID().substring(0, 16)}`;

        fineTransaction = {
          id: txId,
          studentId: loan.studentId,
          feeStructureId: 'fee-struct-lib-fine',
          feeHead: 'LIBRARY_FINE',
          amount: fineAmount,
          gateway: 'RAZORPAY',
          orderId,
          idempotencyKey: `idem-lib-${loanId}`,
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.paymentTransactions.set(orderId, fineTransaction);
        loan.fineTransactionId = fineTransaction.id;
      }
    }

    await db.bookLoans.set(loan.id, loan);

    return { loan, fineTransaction };
  }

  /**
   * Check hall ticket clearance against library holds (overdue loans or unpaid fines)
   * Connects to 48-Hour Provisional Hall Ticket gate
   */
  async checkHallTicketClearance(studentId: string, checkDate: Date = new Date()): Promise<LibraryHallTicketClearance> {
    const allLoans = await db.bookLoans.values();
    const studentLoans = allLoans.filter((l) => l.studentId === studentId);

    // Overdue unreturned loans
    const unreturnedLoans = studentLoans.filter(
      (l) => l.status === 'ISSUED' && checkDate.getTime() > new Date(l.dueDate).getTime()
    );

    // Unpaid library fine transactions (under feeHead 'LIBRARY_FINE' or fee-struct-lib-fine)
    const allTxs = await db.paymentTransactions.values();
    const libraryTxs = allTxs.filter(
      (tx) =>
        tx.studentId === studentId &&
        (tx.feeHead === 'LIBRARY_FINE' || tx.feeStructureId === 'fee-struct-lib-fine') &&
        tx.status === 'PENDING'
    );

    const pendingFineAmount = libraryTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const overdueBooksCount = unreturnedLoans.length;

    const cleared = overdueBooksCount === 0 && pendingFineAmount === 0;

    return {
      studentId,
      cleared,
      overdueBooksCount,
      pendingFineAmount,
      provisionalPassEligible: !cleared, // Eligible for 48h emergency provisional pass
      unreturnedLoans,
    };
  }

  /**
   * Issue a 48-hour provisional hall ticket for a student blocked by library fines
   */
  async issueProvisionalPassForLibraryHold(
    studentId: string,
    examId: string,
    grantedByUserId: string
  ): Promise<ProvisionalHallTicket> {
    const clearance = await this.checkHallTicketClearance(studentId);
    if (clearance.cleared) {
      throw new Error(`Student ${studentId} is already fully cleared in the library. Standard hall ticket applies.`);
    }

    const provisionalPass = await provisionalHallTicketService.issueProvisionalPass({
      studentId,
      examId,
      utrReferenceNumber: `LIB-FINE-PASS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      grantedByUserId,
      reason: 'LIBRARY_HOLD_PROVISIONAL_CLEARANCE',
    });

    return provisionalPass;
  }
}

export const libraryService = new LibraryService();
