"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import FloorPlan, { type FPFloor, type FPApartment, type FPManager } from "@/components/FloorPlan";
import {
  ArrowLeft, Plus, Building2, MapPin, Layers,
  Loader2, X, ChevronRight, ChevronDown, ChevronUp,
  Zap, Upload, Download, FileText,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project  { id: string; name: string; location: string; created_at: string; }
interface Building { id: string; project_id: string; name: string; created_at: string; }

interface AptType {
  rooms: number;
  count: number;
  size_m2: number;
  price: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const vals = line.split(",").map((v) => v.trim().replace(/"/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
      return row;
    });
}

function downloadTemplate() {
  const csv = [
    "number,floor,rooms,size_m2,price,status",
    "101,1,1,45.0,62000,available",
    "102,1,2,65.0,85000,available",
    "103,1,3,90.0,115000,reserved",
    "201,2,1,45.0,63000,available",
    "202,2,2,66.0,86000,sold",
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "apartments_template.csv";
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

const INITIAL_TYPES: AptType[] = [
  { rooms: 1, count: 1, size_m2: 45,  price: 62000  },
  { rooms: 2, count: 2, size_m2: 65,  price: 85000  },
  { rooms: 3, count: 1, size_m2: 90,  price: 115000 },
];

const ROOMS_OPTIONS = ["1", "2", "3", "4"];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [project,   setProject]   = useState<Project | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [floors,      setFloors]      = useState<FPFloor[]>([]);
  const [apartments,  setApartments]  = useState<FPApartment[]>([]);
  const [managers,    setManagers]    = useState<FPManager[]>([]);
  const [loadingFloors, setLoadingFloors] = useState(false);

  // ── Add building modal ─────────────────────────────────────────────────────
  const [showAddBuilding,   setShowAddBuilding]   = useState(false);
  const [buildingName,      setBuildingName]      = useState("");
  const [addingBuilding,    setAddingBuilding]    = useState(false);
  const [addBuildingError,  setAddBuildingError]  = useState<string | null>(null);

  // ── Add floor modal ────────────────────────────────────────────────────────
  const [showAddFloor,    setShowAddFloor]    = useState(false);
  const [floorBuildingId, setFloorBuildingId] = useState("");
  const [floorNumber,     setFloorNumber]     = useState("");
  const [addingFloor,     setAddingFloor]     = useState(false);
  const [addFloorError,   setAddFloorError]   = useState<string | null>(null);

  // ── Add apartment modal ────────────────────────────────────────────────────
  const [showAddApt,   setShowAddApt]   = useState(false);
  const [aptFloorId,   setAptFloorId]   = useState("");
  const [aptForm, setAptForm] = useState({
    number: "", rooms_count: "2", size_m2: "", price: "", status: "available" as "available" | "reserved" | "sold",
  });
  const [addingApt,    setAddingApt]    = useState(false);
  const [addAptError,  setAddAptError]  = useState<string | null>(null);

  // ── Bulk generate modal ────────────────────────────────────────────────────
  const [showBulkGen,    setShowBulkGen]    = useState(false);
  const [bulkBuildingId, setBulkBuildingId] = useState("");
  const [bulkFloors,     setBulkFloors]     = useState("10");
  const [bulkTypes,      setBulkTypes]      = useState<AptType[]>(INITIAL_TYPES);
  const [generating,     setGenerating]     = useState(false);
  const [genResult,      setGenResult]      = useState<string | null>(null);
  const [genError,       setGenError]       = useState<string | null>(null);

  // ── Import modal ───────────────────────────────────────────────────────────
  const [showImport,      setShowImport]      = useState(false);
  const [importBuildingId,setImportBuildingId]= useState("");
  const [importRows,      setImportRows]      = useState<Record<string, string>[]>([]);
  const [importFileErr,   setImportFileErr]   = useState<string | null>(null);
  const [importing,       setImporting]       = useState(false);
  const [importResult,    setImportResult]    = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchProject = useCallback(async () => {
    setLoading(true);
    const [projRes, buildRes] = await Promise.all([
      supabase.from("projects").select("id, name, location, created_at").eq("id", id).single(),
      supabase.from("buildings").select("id, project_id, name, created_at").eq("project_id", id).order("created_at"),
    ]);
    if (projRes.error)  { setError(projRes.error.message);  setLoading(false); return; }
    if (buildRes.error) { setError(buildRes.error.message); setLoading(false); return; }
    setProject(projRes.data);
    setBuildings(buildRes.data ?? []);
    setLoading(false);
  }, [id]);

  const fetchBuildingData = useCallback(async (buildingId: string) => {
    setLoadingFloors(true);
    const [floorsRes, aptsRes] = await Promise.all([
      supabase.from("floors").select("id, floor_number").eq("building_id", buildingId).order("floor_number"),
      supabase.from("apartments").select("id, floor_id, number, rooms_count, floor, size_m2, price, status").eq("building_id", buildingId),
    ]);
    setFloors((floorsRes.data as FPFloor[]) ?? []);
    setApartments((aptsRes.data as FPApartment[]) ?? []);
    setLoadingFloors(false);
  }, []);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  useEffect(() => {
    supabase.from("user_profiles").select("id, full_name, email").eq("role", "manager")
      .then(({ data }) => setManagers((data as FPManager[]) ?? []));
  }, []);

  useEffect(() => {
    if (selectedBuilding) fetchBuildingData(selectedBuilding.id);
    else { setFloors([]); setApartments([]); }
  }, [selectedBuilding, fetchBuildingData]);

  // ── Add building ───────────────────────────────────────────────────────────

  async function handleAddBuilding(e: React.FormEvent) {
    e.preventDefault();
    setAddBuildingError(null);
    if (!buildingName.trim()) { setAddBuildingError("Название обязательно."); return; }
    setAddingBuilding(true);
    const { error: err } = await supabase.from("buildings").insert({ project_id: id, name: buildingName.trim() });
    setAddingBuilding(false);
    if (err) { setAddBuildingError(err.message); return; }
    setBuildingName(""); setShowAddBuilding(false); fetchProject();
  }

  // ── Add floor ──────────────────────────────────────────────────────────────

  function openAddFloor(buildingId: string) {
    setFloorBuildingId(buildingId); setFloorNumber(""); setAddFloorError(null); setShowAddFloor(true);
  }

  async function handleAddFloor(e: React.FormEvent) {
    e.preventDefault();
    setAddFloorError(null);
    const num = parseInt(floorNumber);
    if (isNaN(num) || num < 1)                        { setAddFloorError("Введите корректный номер."); return; }
    if (floors.some((f) => f.floor_number === num))   { setAddFloorError("Этаж уже существует."); return; }
    setAddingFloor(true);
    const { error: err } = await supabase.from("floors").insert({ building_id: floorBuildingId, floor_number: num });
    setAddingFloor(false);
    if (err) { setAddFloorError(err.message); return; }
    setShowAddFloor(false);
    if (selectedBuilding) fetchBuildingData(selectedBuilding.id);
  }

  // ── Add apartment ──────────────────────────────────────────────────────────

  function openAddApt(floorId: string) {
    setAptFloorId(floorId);
    setAptForm({ number: "", rooms_count: "2", size_m2: "", price: "", status: "available" });
    setAddAptError(null); setShowAddApt(true);
  }

  async function handleAddApt(e: React.FormEvent) {
    e.preventDefault();
    setAddAptError(null);
    const size  = parseFloat(aptForm.size_m2);
    const price = parseFloat(aptForm.price);
    if (!aptForm.number.trim())     { setAddAptError("Номер квартиры обязателен."); return; }
    if (isNaN(size)  || size  <= 0) { setAddAptError("Площадь должна быть положительной."); return; }
    if (isNaN(price) || price <= 0) { setAddAptError("Цена должна быть положительной."); return; }
    const floorObj = floors.find((f) => f.id === aptFloorId);
    setAddingApt(true);
    const { error: err } = await supabase.from("apartments").insert({
      project_id: id, building_id: selectedBuilding!.id, floor_id: aptFloorId,
      floor: floorObj?.floor_number ?? 1, number: aptForm.number.trim(),
      rooms_count: parseInt(aptForm.rooms_count), size_m2: size, price, status: aptForm.status,
    });
    setAddingApt(false);
    if (err) { setAddAptError(err.message); return; }
    setShowAddApt(false);
    if (selectedBuilding) fetchBuildingData(selectedBuilding.id);
  }

  // ── Bulk generate ──────────────────────────────────────────────────────────

  async function handleBulkGenerate() {
    setGenError(null); setGenResult(null);
    const floorsNum = parseInt(bulkFloors);
    if (isNaN(floorsNum) || floorsNum < 1) { setGenError("Введите корректное кол-во этажей."); return; }
    const validTypes = bulkTypes.filter((t) => t.count > 0);
    if (!validTypes.length) { setGenError("Добавьте хотя бы один тип квартиры."); return; }
    setGenerating(true);
    try {
      const res = await fetch("/api/bulk-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building_id: bulkBuildingId, project_id: id, floors_count: floorsNum, apartment_types: validTypes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      setGenResult(`✓ Создано этажей: ${json.created_floors}, квартир: ${json.created_apartments}`);
      if (selectedBuilding?.id === bulkBuildingId) fetchBuildingData(bulkBuildingId);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setGenerating(false);
    }
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileErr(null); setImportRows([]); setImportResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target?.result as string);
        if (!rows.length) { setImportFileErr("Данные не найдены. Проверьте формат файла."); return; }
        setImportRows(rows);
      } catch { setImportFileErr("Не удалось прочитать файл."); }
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleImport() {
    if (!importRows.length) return;
    setImporting(true); setImportResult(null); setImportFileErr(null);
    try {
      const res = await fetch("/api/import-apartments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_id: importBuildingId,
          project_id: id,
          rows: importRows.map((r) => ({
            number:  r.number  ?? r["номер"]    ?? "",
            floor:   parseInt(r.floor   ?? r["этаж"]     ?? "0"),
            rooms:   parseInt(r.rooms   ?? r["комнаты"]  ?? "1"),
            size_m2: parseFloat(r.size_m2 ?? r["площадь"] ?? "0"),
            price:   parseFloat(r.price   ?? r["цена"]    ?? "0"),
            status:  r.status  ?? r["статус"]  ?? "available",
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      const errMsg = json.errors?.length ? ` (${json.errors.length} ошибок)` : "";
      setImportResult(`✓ Импортировано ${json.imported} из ${json.total}${errMsg}`);
      if (selectedBuilding?.id === importBuildingId) fetchBuildingData(importBuildingId);
    } catch (err) {
      setImportFileErr(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setImporting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalAperFloor = bulkTypes.reduce((s, t) => s + (t.count || 0), 0);
  const bulkPreview    = `${parseInt(bulkFloors) || 0} эт. × ${totalAperFloor} кв. = ${(parseInt(bulkFloors) || 0) * totalAperFloor} квартир`;

  return (
    <AppShell>
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
        <button onClick={() => router.push("/projects")}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: "#64748b" }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs" style={{ color: "#475569" }}>Проекты</span>
          <ChevronRight className="w-3 h-3 shrink-0" style={{ color: "#334155" }} />
          <span className="text-sm font-semibold text-white truncate">
            {loading ? "…" : project?.name}
          </span>
        </div>
      </header>

      <main className="px-6 py-6 w-full space-y-6">
        {error && (
          <div className="rounded-lg px-4 py-3 text-sm border"
            style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {/* Project info */}
        {project && !loading && (
          <div className="rounded-xl border p-5 flex items-center gap-4"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
              style={{ backgroundColor: "#1e1b4b" }}>
              <Building2 className="w-6 h-6" style={{ color: "#6366f1" }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white">{project.name}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3 h-3" style={{ color: "#475569" }} />
                <span className="text-xs" style={{ color: "#64748b" }}>{project.location}</span>
              </div>
            </div>
            <div className="ml-auto flex gap-5 text-center shrink-0">
              <div>
                <p className="text-xl font-bold text-white">{buildings.length}</p>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>Корпусов</p>
              </div>
              <div>
                <p className="text-xl font-bold text-white">{apartments.length}</p>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>Квартир</p>
              </div>
            </div>
          </div>
        )}

        {/* Buildings */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Корпуса</h2>
            <button
              onClick={() => { setBuildingName(""); setAddBuildingError(null); setShowAddBuilding(true); }}
              className="flex items-center gap-1.5 text-xs font-medium text-white px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: "#6366f1" }}>
              <Plus className="w-3.5 h-3.5" />Добавить корпус
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl border animate-pulse"
                  style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }} />
              ))}
            </div>
          ) : buildings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border"
              style={{ borderColor: "#1e2536", borderStyle: "dashed" }}>
              <Building2 className="w-7 h-7" style={{ color: "#1e2536" }} />
              <p className="text-sm" style={{ color: "#475569" }}>Нет корпусов. Добавьте первый.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {buildings.map((b) => {
                const active = selectedBuilding?.id === b.id;
                return (
                  <div key={b.id} className="rounded-xl border overflow-hidden transition-all"
                    style={{ borderColor: active ? "#6366f1" : "#1e2536", backgroundColor: active ? "#1a1040" : "#0d1117" }}>
                    {/* Building toggle */}
                    <button onClick={() => setSelectedBuilding(active ? null : b)}
                      className="w-full p-4 text-left flex items-center justify-between gap-2 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                          style={{ backgroundColor: active ? "#6366f1" : "#1e1b4b" }}>
                          <Building2 className="w-4 h-4 text-white" />
                        </div>
                        <p className="text-sm font-semibold text-white truncate">{b.name}</p>
                      </div>
                      {active
                        ? <ChevronUp   className="w-4 h-4 shrink-0" style={{ color: "#6366f1" }} />
                        : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "#334155" }} />}
                    </button>

                    {/* Action buttons (when selected) */}
                    {active && (
                      <div className="px-3 pb-3 border-t" style={{ borderColor: "#1e2536" }}>
                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          <button onClick={() => openAddFloor(b.id)}
                            className="flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-colors hover:border-indigo-500/40"
                            style={{ borderColor: "#1e2536", color: "#64748b" }}>
                            <Layers className="w-3.5 h-3.5" />
                            <span>Этаж</span>
                          </button>
                          <button
                            onClick={() => { setBulkBuildingId(b.id); setGenResult(null); setGenError(null); setBulkTypes(INITIAL_TYPES); setBulkFloors("10"); setShowBulkGen(true); }}
                            className="flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-colors hover:border-indigo-500/40"
                            style={{ borderColor: "#1e2536", color: "#64748b" }}>
                            <Zap className="w-3.5 h-3.5" />
                            <span>Создать</span>
                          </button>
                          <button
                            onClick={() => { setImportBuildingId(b.id); setImportRows([]); setImportResult(null); setImportFileErr(null); setShowImport(true); }}
                            className="flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-colors hover:border-indigo-500/40"
                            style={{ borderColor: "#1e2536", color: "#64748b" }}>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Импорт</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floor plan */}
        {selectedBuilding && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-white">
                План — {selectedBuilding.name}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}>
                {floors.length} этажей
              </span>
              {floors.length > 0 && (
                <button
                  onClick={() => openAddFloor(selectedBuilding.id)}
                  className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors hover:border-indigo-500/40"
                  style={{ borderColor: "#1e2536", color: "#64748b" }}>
                  <Plus className="w-3 h-3" />Этаж
                </button>
              )}
            </div>

            {loadingFloors ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#6366f1" }} />
              </div>
            ) : floors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border"
                style={{ borderColor: "#1e2536", borderStyle: "dashed" }}>
                <Layers className="w-6 h-6" style={{ color: "#1e2536" }} />
                <p className="text-sm" style={{ color: "#475569" }}>Нет этажей. Добавьте вручную или используйте массовое создание.</p>
                <div className="flex gap-2">
                  <button onClick={() => openAddFloor(selectedBuilding.id)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}>
                    <Plus className="w-3 h-3" />Добавить этаж
                  </button>
                  <button
                    onClick={() => { setBulkBuildingId(selectedBuilding.id); setGenResult(null); setGenError(null); setBulkTypes(INITIAL_TYPES); setBulkFloors("10"); setShowBulkGen(true); }}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: "#0f0a30", color: "#a5b4fc", border: "1px solid #1e1b4b" }}>
                    <Zap className="w-3 h-3" />Массовое создание
                  </button>
                </div>
              </div>
            ) : (
              <FloorPlan
                floors={floors}
                apartments={apartments}
                managers={managers}
                onRefresh={() => fetchBuildingData(selectedBuilding.id)}
              />
            )}
          </div>
        )}
      </main>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Modals                                                                  */}
      {/* ─────────────────────────────────────────────────────────────────────── */}

      {/* Add building */}
      {showAddBuilding && (
        <Modal title="Добавить корпус" onClose={() => setShowAddBuilding(false)}>
          <form onSubmit={handleAddBuilding} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>Название корпуса</label>
              <ModalInput placeholder="напр. Корпус А" value={buildingName} onChange={setBuildingName} />
            </div>
            {addBuildingError && <ErrMsg msg={addBuildingError} />}
            <ModalButtons onCancel={() => setShowAddBuilding(false)} loading={addingBuilding} label="Добавить" />
          </form>
        </Modal>
      )}

      {/* Add floor */}
      {showAddFloor && (
        <Modal title="Добавить этаж" onClose={() => setShowAddFloor(false)}>
          <form onSubmit={handleAddFloor} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>Номер этажа</label>
              <input type="number" required min={1} placeholder="напр. 5"
                value={floorNumber} onChange={(e) => setFloorNumber(e.target.value)}
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")} />
            </div>
            {addFloorError && <ErrMsg msg={addFloorError} />}
            <ModalButtons onCancel={() => setShowAddFloor(false)} loading={addingFloor} label="Добавить" />
          </form>
        </Modal>
      )}

      {/* Add apartment */}
      {showAddApt && (
        <Modal title="Добавить квартиру" onClose={() => setShowAddApt(false)}>
          <form onSubmit={handleAddApt} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Номер кв.</label>
                <input type="text" required placeholder="напр. А-301"
                  value={aptForm.number} onChange={(e) => setAptForm((f) => ({ ...f, number: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Статус</label>
                <select value={aptForm.status}
                  onChange={(e) => setAptForm((f) => ({ ...f, status: e.target.value as typeof aptForm.status }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none appearance-none"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
                  {(["available", "reserved", "sold"] as const).map((s) => (
                    <option key={s} value={s} style={{ backgroundColor: "#0d1117" }}>
                      {s === "available" ? "Свободна" : s === "reserved" ? "Забронирована" : "Продана"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Комнаты</label>
              <div className="grid grid-cols-4 gap-1.5">
                {ROOMS_OPTIONS.map((v) => (
                  <button key={v} type="button"
                    onClick={() => setAptForm((f) => ({ ...f, rooms_count: v }))}
                    className="py-2 rounded-lg text-xs font-medium border transition-colors"
                    style={{
                      backgroundColor: aptForm.rooms_count === v ? "#1e1b4b" : "#080b14",
                      borderColor:     aptForm.rooms_count === v ? "#6366f1" : "#1e2536",
                      color:           aptForm.rooms_count === v ? "#a5b4fc" : "#64748b",
                    }}>
                    {v === "4" ? "4+" : v}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Площадь (м²)</label>
                <input type="number" required min={1} step="0.1" placeholder="65.5"
                  value={aptForm.size_m2} onChange={(e) => setAptForm((f) => ({ ...f, size_m2: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Цена ($)</label>
                <input type="number" required min={1} placeholder="75000"
                  value={aptForm.price} onChange={(e) => setAptForm((f) => ({ ...f, price: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")} />
              </div>
            </div>
            {addAptError && <ErrMsg msg={addAptError} />}
            <ModalButtons onCancel={() => setShowAddApt(false)} loading={addingApt} label="Добавить" />
          </form>
        </Modal>
      )}

      {/* ── Bulk generate modal ─────────────────────────────────────────────── */}
      {showBulkGen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
          <div className="w-full max-w-xl rounded-2xl border flex flex-col max-h-[90vh]"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "#1e2536" }}>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" style={{ color: "#6366f1" }} />
                <h2 className="text-base font-semibold text-white">Массовое создание квартир</h2>
              </div>
              <button onClick={() => setShowBulkGen(false)}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Floors count */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>
                  Количество этажей
                </label>
                <input type="number" min={1} max={99} value={bulkFloors}
                  onChange={(e) => setBulkFloors(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")} />
              </div>

              {/* Apartment types table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>Типы квартир</label>
                  <button
                    onClick={() => setBulkTypes((t) => [...t, { rooms: 1, count: 1, size_m2: 45, price: 60000 }])}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg"
                    style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}>
                    <Plus className="w-3 h-3" />Добавить тип
                  </button>
                </div>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#1e2536" }}>
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e2536" }}>
                        {["Комн.", "Кол-во", "Площадь м²", "Цена $", ""].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-medium"
                            style={{ color: "#475569", backgroundColor: "#080b14" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bulkTypes.map((type, idx) => (
                        <tr key={idx}
                          style={{ borderBottom: idx < bulkTypes.length - 1 ? "1px solid #1e2536" : undefined }}>
                          <td className="px-2 py-2">
                            <select value={type.rooms}
                              onChange={(e) => setBulkTypes((t) => t.map((r, i) => i === idx ? { ...r, rooms: parseInt(e.target.value) } : r))}
                              className="w-14 rounded px-1.5 py-1.5 text-xs text-white outline-none appearance-none"
                              style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
                              {[1, 2, 3, 4].map((r) => (
                                <option key={r} value={r} style={{ backgroundColor: "#0d1117" }}>
                                  {r}{r === 4 ? "+" : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" min={0} value={type.count}
                              onChange={(e) => setBulkTypes((t) => t.map((r, i) => i === idx ? { ...r, count: parseInt(e.target.value) || 0 } : r))}
                              className="w-14 rounded px-1.5 py-1.5 text-xs text-white outline-none"
                              style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }} />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" min={1} step="0.1" value={type.size_m2}
                              onChange={(e) => setBulkTypes((t) => t.map((r, i) => i === idx ? { ...r, size_m2: parseFloat(e.target.value) || 0 } : r))}
                              className="w-20 rounded px-1.5 py-1.5 text-xs text-white outline-none"
                              style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }} />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" min={1} value={type.price}
                              onChange={(e) => setBulkTypes((t) => t.map((r, i) => i === idx ? { ...r, price: parseFloat(e.target.value) || 0 } : r))}
                              className="w-24 rounded px-1.5 py-1.5 text-xs text-white outline-none"
                              style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }} />
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => setBulkTypes((t) => t.filter((_, i) => i !== idx))}
                              className="p-1 rounded hover:bg-red-500/10" style={{ color: "#475569" }}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Preview */}
              <div className="flex items-center gap-2.5 rounded-lg px-4 py-3"
                style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
                <Zap className="w-4 h-4 shrink-0" style={{ color: "#6366f1" }} />
                <span className="text-xs" style={{ color: "#64748b" }}>Будет создано:</span>
                <span className="text-sm font-semibold ml-auto" style={{ color: "#a5b4fc" }}>
                  {bulkPreview}
                </span>
              </div>

              {genError  && <ErrMsg msg={genError} />}
              {genResult && <p className="text-sm" style={{ color: "#34d399" }}>{genResult}</p>}
            </div>

            <div className="px-6 py-4 border-t shrink-0 flex gap-3" style={{ borderColor: "#1e2536" }}>
              <button onClick={() => setShowBulkGen(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                Отмена
              </button>
              <button onClick={handleBulkGenerate} disabled={generating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "#6366f1" }}>
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Создание…</>
                  : <><Zap className="w-4 h-4" />Создать квартиры</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import modal ─────────────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
          <div className="w-full max-w-2xl rounded-2xl border flex flex-col max-h-[90vh]"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "#1e2536" }}>
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4" style={{ color: "#6366f1" }} />
                <h2 className="text-base font-semibold text-white">Импорт из Excel / CSV</h2>
              </div>
              <button onClick={() => setShowImport(false)}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Template */}
              <div className="flex items-center justify-between rounded-lg px-4 py-3"
                style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
                <div>
                  <p className="text-sm font-medium text-white">Шаблон CSV</p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                    Колонки: number, floor, rooms, size_m2, price, status
                  </p>
                </div>
                <button onClick={downloadTemplate}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}>
                  <Download className="w-3.5 h-3.5" />Скачать
                </button>
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#94a3b8" }}>
                  Загрузить файл (.csv)
                </label>
                <label
                  className="flex flex-col items-center justify-center gap-2 w-full py-6 rounded-xl border cursor-pointer transition-colors hover:border-indigo-500/40"
                  style={{ borderColor: "#1e2536", borderStyle: "dashed", backgroundColor: "#080b14" }}>
                  <FileText className="w-6 h-6" style={{ color: "#334155" }} />
                  <span className="text-xs" style={{ color: "#64748b" }}>
                    {importRows.length > 0 ? `Загружено ${importRows.length} строк` : "Нажмите для выбора файла CSV"}
                  </span>
                  <input type="file" accept=".csv,.txt" onChange={handleImportFile} className="hidden" />
                </label>
              </div>

              {importFileErr && <ErrMsg msg={importFileErr} />}

              {/* Preview table */}
              {importRows.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: "#94a3b8" }}>
                    Предпросмотр — {importRows.length} строк
                  </p>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#1e2536" }}>
                    <div className="overflow-x-auto max-h-52 overflow-y-auto">
                      <table className="w-full">
                        <thead className="sticky top-0" style={{ backgroundColor: "#0d1117" }}>
                          <tr style={{ borderBottom: "1px solid #1e2536" }}>
                            {["Номер", "Этаж", "Комн.", "Площадь", "Цена", "Статус"].map((h) => (
                              <th key={h} className="px-3 py-2 text-left text-xs font-medium"
                                style={{ color: "#475569" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.slice(0, 20).map((row, i) => (
                            <tr key={i}
                              style={{ borderBottom: i < Math.min(importRows.length, 20) - 1 ? "1px solid #1e2536" : undefined }}>
                              <td className="px-3 py-1.5 text-xs font-mono text-white">{row.number}</td>
                              <td className="px-3 py-1.5 text-xs" style={{ color: "#94a3b8" }}>{row.floor}</td>
                              <td className="px-3 py-1.5 text-xs" style={{ color: "#94a3b8" }}>{row.rooms}</td>
                              <td className="px-3 py-1.5 text-xs" style={{ color: "#94a3b8" }}>{row.size_m2}</td>
                              <td className="px-3 py-1.5 text-xs" style={{ color: "#94a3b8" }}>{row.price}</td>
                              <td className="px-3 py-1.5 text-xs" style={{ color: "#64748b" }}>{row.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importRows.length > 20 && (
                      <p className="px-3 py-2 text-xs border-t"
                        style={{ color: "#475569", borderColor: "#1e2536" }}>
                        … ещё {importRows.length - 20} строк
                      </p>
                    )}
                  </div>
                </div>
              )}

              {importResult && <p className="text-sm" style={{ color: "#34d399" }}>{importResult}</p>}
            </div>

            <div className="px-6 py-4 border-t shrink-0 flex gap-3" style={{ borderColor: "#1e2536" }}>
              <button onClick={() => setShowImport(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                Отмена
              </button>
              <button onClick={handleImport} disabled={importing || importRows.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "#6366f1" }}>
                {importing
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Импорт…</>
                  : <><Upload className="w-4 h-4" />Импортировать {importRows.length > 0 ? `(${importRows.length})` : ""}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Shared modal helpers ───────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
      <div className="w-full max-w-sm rounded-2xl border p-6"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input type="text" required placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
      style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
      onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")} />
  );
}

function ModalButtons({ onCancel, loading, label }: { onCancel: () => void; loading: boolean; label: string }) {
  return (
    <div className="flex gap-3">
      <button type="button" onClick={onCancel}
        className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
        style={{ border: "1px solid #1e2536", color: "#64748b" }}>
        Отмена
      </button>
      <button type="submit" disabled={loading}
        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: "#6366f1" }}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Сохранение…</> : label}
      </button>
    </div>
  );
}

function ErrMsg({ msg }: { msg: string }) {
  return <p className="text-sm" style={{ color: "#fca5a5" }}>{msg}</p>;
}
