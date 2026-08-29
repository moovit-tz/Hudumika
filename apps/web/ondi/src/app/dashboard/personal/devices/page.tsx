"use client";

import { useState, useEffect } from "react";
import { GlassPanel } from "@/components/OneUI";
import { apiFetch } from "@/lib/api";
import {
  Smartphone,
  Tablet,
  Laptop,
  Globe,
  Clock,
  ShieldCheck,
  X,
  LogOut,
  MapPin,
  Zap,
  Loader2,
  ShieldAlert,
  Lock,
  Unlock,
  Check,
} from "lucide-react";
import { Sk } from "@/components/Skeleton";
import { parseUserAgent } from "@/lib/device";

interface Device {
  id: string;
  deviceId: string;
  deviceName: string;
  userAgent?: string;
  location?: string;
  isLocked: boolean;
  isTrusted: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    apiFetch("/devices")
      .then((data) => setDevices(data.devices ?? data ?? []))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleTrust(deviceId: string, trust: boolean) {
    setActionId(deviceId);
    try {
      await apiFetch(`/devices/${deviceId}/trust`, {
        method: "PATCH",
        body: JSON.stringify({ trusted: trust }),
      });
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, isTrusted: trust } : d)),
      );
      showToast(trust ? "Device marked as trusted" : "Device trust removed");
    } catch {
      showToast("Action failed", "error");
    } finally {
      setActionId(null);
    }
  }

  async function handleLock(deviceId: string, lock: boolean) {
    setActionId(deviceId);
    try {
      await apiFetch(`/devices/${deviceId}/${lock ? "lock" : "unlock"}`, {
        method: "POST",
      });
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, isLocked: lock } : d)),
      );
      showToast(lock ? "Device locked" : "Device unlocked");
    } catch {
      showToast("Action failed", "error");
    } finally {
      setActionId(null);
    }
  }

  async function handleRemove(deviceId: string) {
    if (!confirm("Remove this device? All sessions on it will be revoked."))
      return;
    setActionId(deviceId);
    try {
      await apiFetch(`/devices/${deviceId}`, { method: "DELETE" });
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      showToast("Device removed");
    } catch {
      showToast("Failed to remove device", "error");
    } finally {
      setActionId(null);
    }
  }

  const icon = (userAgent?: string) => {
    switch (parseUserAgent(userAgent).deviceType) {
      case "Mobile":
        return Smartphone;
      case "Tablet":
        return Tablet;
      default:
        return Laptop;
    }
  };

  return (
    <div className="p-8 lg:p-12 max-w-5xl mx-auto space-y-10">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 ${
            toast.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {toast.type === "error" ? (
            <ShieldAlert size={14} />
          ) : (
            <Check size={14} />
          )}
          {toast.message}
        </div>
      )}

      <div className="space-y-2">
        <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
          Trusted <span className="text-[#4253D1]">Devices</span>
        </h1>
        <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
          Devices that have accessed your Ondi identity vault.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 bg-white border border-slate-100 rounded-lg">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Sk className="w-12 h-12 rounded-lg" />
                  <div className="space-y-2">
                    <Sk className="h-3.5 w-32" />
                    <Sk className="h-2.5 w-40" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Sk className="h-8 w-8 rounded-lg" />
                  <Sk className="h-8 w-8 rounded-lg" />
                  <Sk className="h-8 w-8 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : devices.length === 0 ? (
        <GlassPanel className="p-12 text-center">
          <Smartphone size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-sm text-slate-400">No devices registered</p>
        </GlassPanel>
      ) : (
        <div className="space-y-4">
          {devices.map((device, i) => {
            const Icon = icon(device.userAgent);
            const isActing = actionId === device.id;
            return (
              <div key={device.id}>
                <GlassPanel className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-lg flex items-center justify-center ${device.isLocked ? "bg-red-50" : device.isTrusted ? "bg-emerald-50" : "bg-slate-100"}`}
                      >
                        <Icon
                          size={22}
                          className={
                            device.isLocked
                              ? "text-red-500"
                              : device.isTrusted
                                ? "text-emerald-600"
                                : "text-slate-500"
                          }
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-[#001633]">
                            {device.deviceName || "Unknown Device"}
                          </h3>
                          {device.isLocked && (
                            <span className="text-[9px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                              Locked
                            </span>
                          )}
                          {device.isTrusted && !device.isLocked && (
                            <span className="text-[9px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
                              Trusted
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {parseUserAgent(device.userAgent).summary}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                          {device.location && (
                            <span className="flex items-center gap-1">
                              <Globe size={10} />
                              {device.location}
                            </span>
                          )}
                          {device.lastUsedAt && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {new Date(device.lastUsedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {/* Browsers never expose a real hardware serial number to
                            JS on any platform — this is the stable per-browser
                            identifier Ondi actually generates and keys dedup on
                            (see getDeviceFingerprint in lib/session.ts), labeled
                            for what it is rather than faked as a serial number. */}
                        <p className="text-[9px] text-slate-300 mt-1 font-mono">
                          Device ID: {device.deviceId.slice(0, 18)}…
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isActing ? (
                        <Loader2
                          size={16}
                          className="animate-spin text-[#4253D1]"
                        />
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              handleTrust(device.id, !device.isTrusted)
                            }
                            className={`p-2 rounded-lg text-xs font-bold transition-all ${device.isTrusted ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                            title={
                              device.isTrusted
                                ? "Remove trust"
                                : "Mark as trusted"
                            }
                          >
                            {device.isTrusted ? (
                              <ShieldCheck size={15} />
                            ) : (
                              <Zap size={15} />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              handleLock(device.id, !device.isLocked)
                            }
                            className={`p-2 rounded-lg transition-all ${device.isLocked ? "bg-orange-50 text-orange-600 hover:bg-orange-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                            title={
                              device.isLocked ? "Unlock device" : "Lock device"
                            }
                          >
                            {device.isLocked ? (
                              <Unlock size={15} />
                            ) : (
                              <Lock size={15} />
                            )}
                          </button>
                          <button
                            onClick={() => handleRemove(device.id)}
                            className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-all"
                            title="Remove device"
                          >
                            <X size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </GlassPanel>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
