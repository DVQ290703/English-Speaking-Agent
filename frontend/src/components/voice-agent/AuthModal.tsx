import { useState } from "react";
import { Eye, EyeOff, LogIn, UserPlus, X } from "lucide-react";

export interface AuthUser {
  name: string;
  email?: string;
}

interface AuthModalProps {
  mode: "login" | "register";
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

export default function AuthModal({ mode, onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<"login" | "register">(mode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = () => {
    setError("");
    if (tab === "register" && !name.trim()) {
      setError("Vui lòng nhập tên của bạn.");
      return;
    }
    if (!email.includes("@")) {
      setError("Email không hợp lệ.");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }
    onSuccess({ name: name.trim() || email.split("@")[0], email });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#13171f] border border-white/10 rounded-xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8">
          <div className="flex gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => {
                setTab("login");
                setError("");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "login" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              <LogIn className="w-3 h-3" /> Đăng nhập
            </button>
            <button
              onClick={() => {
                setTab("register");
                setError("");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "register" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              <UserPlus className="w-3 h-3" /> Đăng ký
            </button>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/8 text-gray-500 hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {tab === "register" && (
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Tên hiển thị</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
            </div>
          )}
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Mật khẩu</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
              <button
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
              >
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={handleSubmit}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors mt-1"
          >
            {tab === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </div>
      </div>
    </div>
  );
}
