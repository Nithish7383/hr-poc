"use client";

import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { useRouter } from "next/navigation";
import { api, setToken } from "../../lib/api";
import { useAuth } from "../../lib/useAuth";

// ==========================
// Lifecycle motif
// ==========================

const STAGES = ["Onboarding","Offboarding"];

function LifecycleStack() {
  return (
    <div className="border-t border-white/15">
      {STAGES.map((label, i) => (
        <div
          key={label}
          className="flex items-center gap-6 py-5 border-b border-white/15"
        >
          <span className="text-2xl font-semibold text-[#D9A653]">
            0{i + 1}
          </span>

          <span className="text-2xl font-semibold text-[#F7F5F0]">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  // Existing authentication hook
  const { role, logout } = useAuth();

  // Existing login state
  const [email, setEmail] = useState("hr@example.com");
  const [password, setPassword] = useState("demo123");

  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [errors, setErrors] = useState({
    email: "",
    password: "",
  });

  async function handleLogin() {
    const newErrors = {
      email: "",
      password: "",
    };

    let isValid = true;

    if (!email.trim()) {
      newErrors.email = "Email is required";
      isValid = false;
    }

    if (!password.trim()) {
      newErrors.password = "Password is required";
      isValid = false;
    }

    setErrors(newErrors);

    if (!isValid) return;

    setError("");
    setLoading(true);

    try {
      const result = await api.login(email, password);

      setToken(result.access_token, result.role);

      router.push("/dashboard");
    } catch (e) {
      // setError("Login failed -- check credentials");

      setErrors({
        email: "",
        password: "Invalid email or password",
      });
    } finally {
      setLoading(false);
    }
  }

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div className="min-h-screen flex bg-[#FAFAF9]">
      {/* Left */}

      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-center bg-[#14213D] p-20">
        <span className="absolute -right-10 -top-16 text-[320px] text-white/5 font-bold">
          4
        </span>

        <div className="absolute top-0 left-0 h-2 w-24 bg-[#D9A653]" />

        <p className="text-[#D9A653] uppercase tracking-[0.25em] text-xs">
          People Operations Platform
        </p>

        <h1 className="text-6xl font-bold text-white mt-3">
          AI Employee Lifecycle Management Platform
        </h1>

        <p className="text-gray-300 mt-5 max-w-sm">
          One system for every stage of the employee lifecycle.
        </p>

        <div className="mt-12">
          <LifecycleStack />
        </div>
      </div>

      {/* Right */}

      <div className="w-full lg:w-1/2 flex justify-center items-center px-6">
        <div className="w-full max-w-[380px]">
          <p className="uppercase tracking-[0.25em] text-[#D9A653] text-xs">
            Sign In
          </p>

          <h2 className="text-4xl font-bold text-[#14213D] mt-2">
            Welcome
          </h2>

          <p className="text-gray-500 mt-2">
            Enter your credentials.
          </p>

          {/* <p className="text-xs text-gray-400 mt-2">
            Demo users:
            <br />
            hr@example.com
            <br />
            manager@example.com
            <br />
            it@example.com
            <br />
            security@example.com
            <br />
            Password: demo123
          </p> */}

          {/* Email */}

          <div className="mt-8">
            <label className="text-sm">Email</label>

            <input
              type="email"
              value={email}
              placeholder="hr@example.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full border-b p-2 outline-none"
            />

            {errors.email && (
              <p className="text-red-500 text-xs mt-1">
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}

          <div className="mt-6">
            <label className="text-sm">Password</label>

            <div className="flex border-b items-center">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                placeholder="********"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full p-2 outline-none"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="px-2"
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>

            {errors.password && (
              <p className="text-red-500 text-xs mt-1">
                {errors.password}
              </p>
            )}

            {error && (
              <p className="text-red-500 text-xs mt-2">
                {error}
              </p>
            )}
          </div>

          {/* Remember */}

          <div className="flex justify-between mt-6">
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) =>
                  setRememberMe(e.target.checked)
                }
              />

              Remember me
            </label>

            <a
              href="#"
              className="text-[#D9A653] text-sm"
            >
              Forgot Password?
            </a>
          </div>

          {/* Login */}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full mt-8 bg-[#14213D] text-white py-3 hover:bg-[#D9A653] transition-colors disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}