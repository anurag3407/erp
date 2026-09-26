"use client";

import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  GraduationCap,
  Calendar,
  CreditCard,
  Library,
  MessageSquare,
  Bell,
  Menu,
  X,
  QrCode,
  CheckCircle,
  Clock,
  BookOpen,
  AlertTriangle,
  Shield,
  Search,
  Check,
  RefreshCw,
  FileCheck,
  Send,
  UserCheck,
  Award,
  Layers,
} from "lucide-react";
import {
  getDashboardData,
  getCourseCatalog,
  enrollInCourse,
  markAttendancePunch,
  getTimetableMatrix,
  getDegreeAudit,
  simulateWhatIf,
  getFeeTransactions,
  payFeeTransaction,
  requestProvisionalPass,
  getLibraryBooks,
  borrowLibraryBook,
  getLeaveApplications,
  submitLeave,
  submitGrievance,
  getNotifications,
  markNotificationAsRead,
} from "./actions";

type Role = "Student" | "Faculty" | "HOD" | "Admin";

export default function ERPDashboard() {
  const [role, setRole] = useState<Role>("Student");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Data states
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [degreeAudit, setDegreeAudit] = useState<any>(null);
  const [courseCatalog, setCourseCatalog] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [feeTransactions, setFeeTransactions] = useState<any[]>([]);
  const [libraryBooks, setLibraryBooks] = useState<any[]>([]);
  const [leaveApps, setLeaveApps] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Interactive UI states
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [qrTimer, setQrTimer] = useState(10);
  const [whatIfTarget, setWhatIfTarget] = useState("prog-ai-ds");
  const [whatIfResult, setWhatIfResult] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [leaveForm, setLeaveForm] = useState({
    leaveType: "CASUAL",
    startDate: "2025-10-15",
    endDate: "2025-10-17",
    reason: "",
  });
  const [grievanceForm, setGrievanceForm] = useState({
    category: "ACADEMIC" as any,
    subject: "",
    description: "",
    isAnonymous: false,
  });

  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Initial load and tab transitions
  useEffect(() => {
    loadTabContent(activeTab);
  }, [activeTab, role]);

  // Rolling QR 10s timer simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setQrTimer((prev) => (prev <= 1 ? 10 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadTabContent = async (tab: string) => {
    setLoading(true);
    try {
      if (tab === "dashboard") {
        const res = await getDashboardData(role);
        if (res.success) setDashboardData(res.data);
        const audit = await getDegreeAudit();
        if (audit.success) setDegreeAudit(audit.data);
      } else if (tab === "catalog") {
        const res = await getCourseCatalog();
        if (res.success) setCourseCatalog(res.data);
      } else if (tab === "timetable") {
        const res = await getTimetableMatrix();
        if (res.success) setTimetable(res.data);
      } else if (tab === "degree-audit") {
        const audit = await getDegreeAudit();
        if (audit.success) setDegreeAudit(audit.data);
      } else if (tab === "fees") {
        const res = await getFeeTransactions();
        if (res.success) setFeeTransactions(res.data);
      } else if (tab === "library") {
        const res = await getLibraryBooks();
        if (res.success) setLibraryBooks(res.data);
      } else if (tab === "leave") {
        const res = await getLeaveApplications();
        if (res.success) setLeaveApps(res.data);
      } else if (tab === "notifications") {
        const res = await getNotifications();
        if (res.success) setNotifications(res.data);
      }
    } catch {
      showToast("error", "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  // Actions
  const handleAttendancePunch = async () => {
    setLoading(true);
    const res = await markAttendancePunch();
    setLoading(false);
    if (res.success) {
      showToast("success", "Biometric & Geofence attendance verified: Marked PRESENT!");
    } else {
      showToast("error", res.error || "Attendance verification rejected");
    }
  };

  const handleEnrollCourse = async (offeringId: string) => {
    setLoading(true);
    const res = await enrollInCourse(offeringId);
    setLoading(false);
    if (res.success) {
      showToast("success", "Enrolled successfully! Redis seat hold committed.");
      loadTabContent("catalog");
    } else {
      showToast("error", res.error || "Enrollment failed");
    }
  };

  const handlePayFee = async (txId: string) => {
    setLoading(true);
    const res = await payFeeTransaction(txId);
    setLoading(false);
    if (res.success) {
      showToast("success", "Payment reconciled via Razorpay UPI! Status updated to CAPTURED.");
      loadTabContent("fees");
    } else {
      showToast("error", res.error || "Payment failed");
    }
  };

  const handleRequestProvisionalPass = async () => {
    setLoading(true);
    const res = await requestProvisionalPass("Emergency fee reconciliation provisional pass");
    setLoading(false);
    if (res.success) {
      showToast("success", `48-Hour Provisional Pass ${res.data.id} Issued! Admitted at Exam Gate.`);
    } else {
      showToast("error", res.error || "Failed to issue pass");
    }
  };

  const handleBorrowBook = async (bookId: string) => {
    setLoading(true);
    const res = await borrowLibraryBook(bookId);
    setLoading(false);
    if (res.success) {
      showToast("success", "Book issued! Due date set to +14 days.");
      loadTabContent("library");
    } else {
      showToast("error", res.error || "Borrow failed");
    }
  };

  const handleSimulateWhatIf = async () => {
    setLoading(true);
    const res = await simulateWhatIf(whatIfTarget);
    setLoading(false);
    if (res.success) {
      setWhatIfResult(res.data);
      showToast("success", `What-If simulation completed in ${res.data.simulationTimeMs.toFixed(2)}ms`);
    } else {
      showToast("error", res.error || "Simulation failed");
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.reason.trim()) {
      showToast("error", "Reason is required");
      return;
    }
    setLoading(true);
    const res = await submitLeave({
      ...leaveForm,
      applicantRole: role === "Faculty" ? "FACULTY" : "STUDENT",
    });
    setLoading(false);
    if (res.success) {
      showToast("success", "Leave application submitted! Routed for approval.");
      setLeaveForm({ leaveType: "CASUAL", startDate: "2025-10-15", endDate: "2025-10-17", reason: "" });
      loadTabContent("leave");
    } else {
      showToast("error", res.error || "Leave submission failed");
    }
  };

  const handleSubmitGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grievanceForm.subject.trim() || !grievanceForm.description.trim()) {
      showToast("error", "Subject and description required");
      return;
    }
    setLoading(true);
    const res = await submitGrievance(grievanceForm);
    setLoading(false);
    if (res.success) {
      showToast("success", `Grievance ticket ${res.data.ticketNumber} filed with SLA tracking.`);
      setGrievanceForm({ category: "ACADEMIC", subject: "", description: "", isAnonymous: false });
    } else {
      showToast("error", res.error || "Grievance filing failed");
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    const res = await markNotificationAsRead(id);
    if (res.success) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    }
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "attendance", label: "Attendance (QR)", icon: QrCode },
    { id: "catalog", label: "Course Catalog", icon: BookOpen },
    { id: "timetable", label: "Timetable Matrix", icon: Calendar },
    { id: "degree-audit", label: "Degree Audit", icon: GraduationCap },
    { id: "fees", label: "Fees & Ledger", icon: CreditCard },
    { id: "library", label: "Library Browser", icon: Library },
    { id: "leave", label: "Leave & Grievance", icon: MessageSquare },
    { id: "notifications", label: "Notifications", icon: Bell },
  ];

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-white font-medium text-sm flex items-center gap-2 transition-all ${
            toastMessage.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {toastMessage.type === "success" ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          {toastMessage.text}
        </div>
      )}

      {/* Sidebar Desktop */}
      <aside className="w-64 bg-slate-900 text-white flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-800">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-400" />
            Nexus ERP
          </h1>
          <p className="text-xs text-slate-400 mt-1">Enterprise Higher Education</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="text-xs text-slate-400 mb-2">Switch Active Persona:</div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full bg-slate-800 text-white border border-slate-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="Student">Student (usr-stu-01)</option>
            <option value="Faculty">Faculty (Dr. Turing)</option>
            <option value="HOD">Department HOD</option>
            <option value="Admin">Exam Cell / Admin</option>
          </select>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-slate-900 text-white flex flex-col z-50">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h1 className="text-lg font-bold flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-indigo-400" />
                Nexus ERP
              </h1>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      activeTab === item.id ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-slate-600">
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {navItems.find((i) => i.id === activeTab)?.label}
              </h2>
              <p className="text-xs text-slate-500">Autonomous Institute of Technology & Sciences</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab("notifications")}
              className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-600 rounded-full" />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                {role.charAt(0)}
              </div>
              <div className="hidden sm:block text-left text-xs">
                <p className="font-semibold text-slate-800">{role === "Student" ? "Alex Rivera" : "Dr. Alan Turing"}</p>
                <p className="text-slate-500">{role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Scrollable Body */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* TAB 1: DASHBOARD */}
            {activeTab === "dashboard" && (
              <div className="space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Offerings</p>
                    <p className="text-2xl font-bold text-slate-900 mt-2">{dashboardData?.classes || 4}</p>
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Next lecture in 45m
                    </p>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Dues</p>
                    <p className="text-2xl font-bold text-slate-900 mt-2">${dashboardData?.pendingFees || 0}</p>
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Fall 2025 Semester Fee
                    </p>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Borrowed Books</p>
                    <p className="text-2xl font-bold text-slate-900 mt-2">{dashboardData?.libraryBooks || 0}</p>
                    <p className="text-xs text-slate-500 mt-1">Due within standard 14 days</p>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cumulative GPA</p>
                    <p className="text-2xl font-bold text-slate-900 mt-2">{degreeAudit?.cgpa || "8.85"}</p>
                    <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" /> Good Academic Standing
                    </p>
                  </div>
                </div>

                {/* Identity & Status Badge */}
                <div className="bg-linear-to-r from-slate-900 to-indigo-950 text-white p-6 rounded-2xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                      <Shield className="w-3 h-3" /> APAAR ID: 9021-3829-1029 (DigiLocker Synced)
                    </div>
                    <h3 className="text-xl font-bold">Alex Rivera • Roll # 2024CSE001</h3>
                    <p className="text-sm text-slate-300">Bachelor of Technology in Computer Science & Engineering (Semester 5)</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveTab("attendance")}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      Scan Attendance
                    </button>
                    <button
                      onClick={() => setActiveTab("fees")}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg text-sm font-semibold transition-colors"
                    >
                      View Hall Ticket
                    </button>
                  </div>
                </div>

                {/* Quick Academic Progress Snapshot */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold text-slate-800 text-sm">Degree Completion Progress (NEP 2020)</h4>
                    <span className="text-xs font-bold text-indigo-600">82 / 160 Credits (51.2%)</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: "51.2%" }} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-center">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-500">Core Credits</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">48 / 64</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-500">Electives</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">18 / 24</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-500">Open Breadth</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">8 / 12</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-500">Skills / MOOCs</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">8 / 12</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ATTENDANCE (ANTI-PROXY QR) */}
            {activeTab === "attendance" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-2 text-indigo-600 text-xs font-bold tracking-wider uppercase">
                    <QrCode className="w-4 h-4" /> 10-Second Rolling TOTP Token
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-4">CS301: Advanced Operating Systems</h3>
                  
                  {/* Dynamic QR Mock */}
                  <div className="w-48 h-48 bg-slate-900 rounded-2xl flex flex-col items-center justify-center p-4 text-white relative shadow-inner">
                    <div className="w-36 h-36 border-4 border-indigo-500 border-dashed rounded-xl flex items-center justify-center">
                      <span className="text-xs font-mono font-bold text-center tracking-widest text-indigo-300">
                        TOTP-0x{Math.floor(Date.now() / 10000).toString(16).toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <Clock className="w-4 h-4 text-amber-500" /> Token refreshes in:{" "}
                    <span className="text-indigo-600 font-bold">{qrTimer}s</span>
                  </div>

                  <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-500 text-left w-full space-y-1 border border-slate-100">
                    <p><span className="font-semibold text-slate-700">Classroom Centroid:</span> 28.6139° N, 77.2090° E</p>
                    <p><span className="font-semibold text-slate-700">Max Geofence Radius:</span> 25.0 meters</p>
                    <p><span className="font-semibold text-slate-700">Hardware Assertion:</span> WebAuthn FIDO2 Bound</p>
                  </div>

                  <button
                    onClick={handleAttendancePunch}
                    disabled={loading}
                    className="w-full mt-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <UserCheck className="w-4 h-4" /> Punch In (Verify Geofence & Biometric)
                  </button>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <h4 className="font-semibold text-slate-800 text-sm">Recent Lecture Attendance Records</h4>
                  <div className="divide-y divide-slate-100 text-sm">
                    <div className="py-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-slate-800">CS301: Advanced Operating Systems</p>
                        <p className="text-xs text-slate-500">Hall 101 • Dist: 6.1m (Verified)</p>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
                        PRESENT
                      </span>
                    </div>
                    <div className="py-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-slate-800">CS302: Database Engineering</p>
                        <p className="text-xs text-slate-500">Lab 3 • Dist: 12.4m (Verified)</p>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
                        PRESENT
                      </span>
                    </div>
                    <div className="py-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-slate-800">MA301: Applied Probability</p>
                        <p className="text-xs text-slate-500">Hall 204 • On-Duty Pass (Hackathon)</p>
                      </div>
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-semibold">
                        ON_DUTY
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: COURSE CATALOG */}
            {activeTab === "catalog" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-slate-600">Browse departmental electives and core courses for Fall 2025.</p>
                  <button
                    onClick={() => loadTabContent("catalog")}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh Seats
                  </button>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                      <tr>
                        <th className="py-3 px-4">Course</th>
                        <th className="py-3 px-4">Faculty</th>
                        <th className="py-3 px-4">Credits</th>
                        <th className="py-3 px-4">Schedule</th>
                        <th className="py-3 px-4">Available Seats</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {courseCatalog.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">Loading catalog offerings...</td>
                        </tr>
                      ) : (
                        courseCatalog.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <p className="font-semibold text-slate-800">{c.courseCode}: {c.courseName}</p>
                              <p className="text-xs text-slate-500">Section {c.section}</p>
                            </td>
                            <td className="py-3 px-4 text-slate-600">{c.facultyName}</td>
                            <td className="py-3 px-4 font-semibold text-slate-700">{c.credits}</td>
                            <td className="py-3 px-4 text-xs text-slate-600">{c.scheduleSlot}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                c.availableSeats > 10
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}>
                                {c.availableSeats} / {c.capacity}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleEnrollCourse(c.id)}
                                disabled={loading || c.availableSeats === 0}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
                              >
                                Enroll Now
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: TIMETABLE MATRIX */}
            {activeTab === "timetable" && (
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 text-sm">Weekly Academic Lecture Grid (Constraint Satisfaction Validated)</h3>
                    <span className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-semibold border border-emerald-200">
                      0 Room / Faculty Clashes
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
                      <div key={day} className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2">
                        <div className="font-bold text-xs uppercase text-slate-600 border-b border-slate-200 pb-1">{day}</div>
                        {timetable.filter((s) => s.dayOfWeek === day).length === 0 ? (
                          <p className="text-xs text-slate-400 italic py-2">No scheduled lectures</p>
                        ) : (
                          timetable
                            .filter((s) => s.dayOfWeek === day)
                            .map((slot) => (
                              <div key={slot.id} className="bg-white p-2.5 rounded-md border border-slate-200 text-xs shadow-2xs space-y-1">
                                <p className="font-bold text-slate-800">{slot.courseCode}</p>
                                <p className="text-indigo-600 font-semibold">{slot.startTime} - {slot.endTime}</p>
                                <p className="text-slate-500">{slot.roomCode} • {slot.facultyName}</p>
                              </div>
                            ))
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: DEGREE AUDIT & WHAT-IF */}
            {activeTab === "degree-audit" && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">National Education Policy (NEP 2020) 4-Tier Milestones</h3>
                      <p className="text-xs text-slate-500">Autonomous Multiple Entry / Exit Framework</p>
                    </div>
                    <span className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-bold">
                      Current Milestone: Undergraduate Diploma
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <p className="font-bold text-emerald-800">Tier 1: Certificate</p>
                      <p className="text-emerald-700 mt-1">40 Credits Required</p>
                      <span className="inline-block mt-2 font-bold text-emerald-600">✓ Achieved</span>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <p className="font-bold text-emerald-800">Tier 2: Diploma</p>
                      <p className="text-emerald-700 mt-1">80 Credits Required</p>
                      <span className="inline-block mt-2 font-bold text-emerald-600">✓ Achieved (82 Cr)</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="font-bold text-slate-800">Tier 3: B.Tech (3-Yr)</p>
                      <p className="text-slate-600 mt-1">120 Credits Required</p>
                      <span className="inline-block mt-2 font-semibold text-slate-500">38 Credits Remaining</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="font-bold text-slate-800">Tier 4: Honours / Res</p>
                      <p className="text-slate-600 mt-1">160 Credits Required</p>
                      <span className="inline-block mt-2 font-semibold text-slate-500">78 Credits Remaining</span>
                    </div>
                  </div>
                </div>

                {/* What-If Simulator Widget */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold uppercase tracking-wider">
                    <Layers className="w-4 h-4" /> Sub-100ms What-If Major/Minor Simulator
                  </div>
                  <h3 className="text-base font-bold text-slate-900">Simulate Changing Degree Specialization</h3>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <select
                      value={whatIfTarget}
                      onChange={(e) => setWhatIfTarget(e.target.value)}
                      className="flex-1 bg-white border border-slate-300 rounded-lg p-2.5 text-sm"
                    >
                      <option value="prog-ai-ds">B.Tech in Artificial Intelligence & Data Science</option>
                      <option value="prog-ece">B.Tech in Electronics & Communication Engineering</option>
                      <option value="prog-cyber">B.Tech in Cyber Security & Forensics</option>
                    </select>
                    <button
                      onClick={handleSimulateWhatIf}
                      disabled={loading}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      Simulate Transfer Credits
                    </button>
                  </div>

                  {whatIfResult && (
                    <div className="mt-4 p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs text-slate-700 space-y-2">
                      <div className="flex justify-between font-bold text-indigo-900 text-sm">
                        <span>Transferable Credits: {whatIfResult.transferableCredits} / {whatIfResult.totalCompletedCredits}</span>
                        <span>Projected Extra Semesters: {whatIfResult.projectedAdditionalSemesters}</span>
                      </div>
                      <p>Remaining Credits Required for Degree: <span className="font-bold">{whatIfResult.remainingCreditsRequired}</span></p>
                      <p className="text-slate-500 italic">Calculation performed via DAG topological intersection in {whatIfResult.simulationTimeMs.toFixed(2)}ms.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 6: FEES & PROVISIONAL PASS */}
            {activeTab === "fees" && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">Semester Fee & Fine Ledger</h3>
                      <p className="text-xs text-slate-500">Integrated with Razorpay UPI & BullMQ auto-healing poller</p>
                    </div>
                    <button
                      onClick={handleRequestProvisionalPass}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <Shield className="w-3.5 h-3.5" /> Emergency 48h Exam Pass
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 text-sm">
                    {feeTransactions.length === 0 ? (
                      <p className="text-center py-6 text-slate-400">No transactions recorded.</p>
                    ) : (
                      feeTransactions.map((tx) => (
                        <div key={tx.id} className="py-3.5 flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-slate-800">{tx.feeHead}</p>
                            <p className="text-xs text-slate-400">{tx.id} • {new Date(tx.createdAt).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-bold text-slate-900">${tx.amount}</span>
                            {tx.status === "CAPTURED" ? (
                              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                                PAID
                              </span>
                            ) : (
                              <button
                                onClick={() => handlePayFee(tx.id)}
                                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold"
                              >
                                Pay via UPI
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: LIBRARY BROWSER */}
            {activeTab === "library" && (
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search books by title, author, or ISBN..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {libraryBooks
                    .filter((b) => b.title.toLowerCase().includes(searchQuery.toLowerCase()) || b.author.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((b) => (
                      <div key={b.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex justify-between items-start">
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-900 text-sm">{b.title}</h4>
                          <p className="text-xs text-slate-500">Author: {b.author}</p>
                          <p className="text-xs text-slate-400">Call #: {b.callNumber} • ISBN: {b.isbn}</p>
                          <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            b.availableCopies > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          }`}>
                            {b.availableCopies} Copies Available
                          </span>
                        </div>
                        <button
                          onClick={() => handleBorrowBook(b.id)}
                          disabled={b.availableCopies === 0}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold disabled:opacity-50"
                        >
                          Borrow
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* TAB 8: LEAVES & GRIEVANCES */}
            {activeTab === "leave" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Leave Application */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <h3 className="font-bold text-slate-900 text-base">Apply for Leave / On-Duty (OD) Pass</h3>
                  <form onSubmit={handleSubmitLeave} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Leave Category</label>
                      <select
                        value={leaveForm.leaveType}
                        onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-md text-sm"
                      >
                        <option value="CASUAL">Casual Leave</option>
                        <option value="MEDICAL">Medical Leave (Condonation Eligible)</option>
                        <option value="DUTY_LEAVE_OD">Official On-Duty (Sports/Hackathon)</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={leaveForm.startDate}
                          onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-md text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">End Date</label>
                        <input
                          type="date"
                          value={leaveForm.endDate}
                          onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-md text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Detailed Reason</label>
                      <textarea
                        rows={2}
                        value={leaveForm.reason}
                        onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                        placeholder="State purpose of leave or OD pass requirement..."
                        className="w-full p-2 border border-slate-300 rounded-md text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold"
                    >
                      Submit for Mentor Sign-Off
                    </button>
                  </form>
                </div>

                {/* Statutory Grievance Redressal */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">Statutory Grievance Redressal</h3>
                      <p className="text-xs text-slate-500">UGC / AICTE Mandatory SLA-Tracked Committee Portal</p>
                    </div>
                    <span className="text-xs font-bold text-rose-600 px-2 py-0.5 bg-rose-50 border border-rose-200 rounded-full">
                      SLA: 24h - 7d
                    </span>
                  </div>

                  <form onSubmit={handleSubmitGrievance} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Statutory Committee Category</label>
                      <select
                        value={grievanceForm.category}
                        onChange={(e) => setGrievanceForm({ ...grievanceForm, category: e.target.value as any })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-md text-sm"
                      >
                        <option value="ANTI_RAGGING">Anti-Ragging Squad (24h Mandatory SLA)</option>
                        <option value="HARASSMENT_POSH">Internal Complaints Committee (POSH 48h SLA)</option>
                        <option value="ACADEMIC">Academic Disciplinary Committee (7d SLA)</option>
                        <option value="INFRASTRUCTURE">Hostel & Facilities Welfare</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Grievance Subject</label>
                      <input
                        type="text"
                        value={grievanceForm.subject}
                        onChange={(e) => setGrievanceForm({ ...grievanceForm, subject: e.target.value })}
                        placeholder="Brief summary of issue..."
                        className="w-full p-2 border border-slate-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                      <textarea
                        rows={2}
                        value={grievanceForm.description}
                        onChange={(e) => setGrievanceForm({ ...grievanceForm, description: e.target.value })}
                        placeholder="Provide details for statutory inquiry..."
                        className="w-full p-2 border border-slate-300 rounded-md text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="anon"
                        checked={grievanceForm.isAnonymous}
                        onChange={(e) => setGrievanceForm({ ...grievanceForm, isAnonymous: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      <label htmlFor="anon" className="text-xs text-slate-600 font-medium">
                        File Anonymously (Identity Protected under Whistleblower Act)
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold"
                    >
                      Submit Grievance Ticket
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 9: NOTIFICATIONS */}
            {activeTab === "notifications" && (
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Campus Notification Center</h3>
                    <p className="text-xs text-slate-500">Real-time Web Push (RFC 8292 VAPID) and institutional announcements</p>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 px-2.5 py-1 bg-indigo-50 rounded-full">
                    {notifications.filter((n) => !n.isRead).length} Unread
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <p className="py-6 text-center text-slate-400 text-sm">No notifications found.</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className={`py-3.5 flex justify-between items-start gap-4 ${n.isRead ? "opacity-60" : ""}`}>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-2xs font-bold ${
                              n.priority === "URGENT" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"
                            }`}>
                              {n.priority}
                            </span>
                            <h4 className="font-semibold text-slate-800 text-sm">{n.title}</h4>
                          </div>
                          <p className="text-xs text-slate-600">{n.body}</p>
                          <p className="text-2xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                        </div>
                        {!n.isRead && (
                          <button
                            onClick={() => handleMarkNotificationRead(n.id)}
                            className="px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-md font-semibold border border-indigo-200"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
