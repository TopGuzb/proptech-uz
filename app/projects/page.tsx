// ─────────────────────────────────────────────────────────────────────────────
// app/projects/page.tsx
//
// Route:  /projects   (all roles can see; admins can edit/delete)
//
// Grid of project cards (one card per development). Each card shows:
//   • Cover image / placeholder gradient
//   • Project name, location, total apartments, sold count
//   • Hover glow + click → /projects/[id]
//
// Admin-only controls:
//   • "+ New Project" modal  → INSERTs into  projects
//   • Edit / Delete on each card  → UPDATE / DELETE
//
// Recent style refresh:  redesigned cards with gradient bar + hover glow
// (commit b021571).
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useRouter } from "next/navigation";
import {
  Plus, MapPin, Building2, Loader2, X,
  FolderKanban, ArrowRight, Pencil, Trash2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  location: string;
  total_buildings: number | null;
  created_at: string;
}

interface FormState {
  name: string;
  location: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Create modal
  const [showModal,  setShowModal]  = useState(false);
  const [form,       setForm]       = useState<FormState>({ name: "", location: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState<string | null>(null);

  // Edit modal
  const [editProject,    setEditProject]    = useState<Project | null>(null);
  const [editForm,       setEditForm]       = useState<FormState>({ name: "", location: "" });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError,      setEditError]      = useState<string | null>(null);

  // Delete confirmation
  const [deleteProject,  setDeleteProject]  = useState<Project | null>(null);
  const [deleting,       setDeleting]       = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchProjects() {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("projects")
      .select("id, name, location, total_buildings, created_at")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setProjects(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  // ── Create project ─────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.location.trim()) {
      setFormError("Name and location are required.");
      return;
    }
    setSubmitting(true);

    const { error: insertError } = await supabase
      .from("projects")
      .insert({ name: form.name.trim(), location: form.location.trim() });

    setSubmitting(false);

    if (insertError) {
      setFormError(insertError.message);
      return;
    }

    setForm({ name: "", location: "" });
    setShowModal(false);
    fetchProjects();
  }

  function openModal() {
    setForm({ name: "", location: "" });
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(project: Project) {
    setEditProject(project);
    setEditForm({ name: project.name, location: project.location });
    setEditError(null);
  }

  async function handleEdit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!editProject) return;
    setEditError(null);
    if (!editForm.name.trim() || !editForm.location.trim()) {
      setEditError("Name and location are required.");
      return;
    }
    setEditSubmitting(true);
    const { error: err } = await supabase
      .from("projects")
      .update({ name: editForm.name.trim(), location: editForm.location.trim() })
      .eq("id", editProject.id);
    setEditSubmitting(false);
    if (err) { setEditError(err.message); return; }
    setEditProject(null);
    fetchProjects();
  }

  async function handleDelete() {
    if (!deleteProject) return;
    setDeleting(true);
    await supabase.from("projects").delete().eq("id", deleteProject.id);
    setDeleting(false);
    setDeleteProject(null);
    fetchProjects();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
      >
        <div>
          <h1 className="text-sm font-semibold text-white">Projects</h1>
          <p className="text-xs" style={{ color: "#475569" }}>
            {loading ? "Loading…" : `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 text-sm font-medium text-white px-3.5 py-2 rounded-lg transition-opacity hover:opacity-80"
          style={{ backgroundColor: "#6366f1" }}
        >
          <Plus className="w-4 h-4" />
          New project
        </button>
      </header>

      <main className="px-6 py-6 w-full">
        {/* Error */}
        {error && (
          <div
            className="mb-6 rounded-lg px-4 py-3 text-sm border"
            style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}
          >
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border h-36 animate-pulse"
                style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-2xl"
              style={{ backgroundColor: "#1e1b4b" }}
            >
              <FolderKanban className="w-7 h-7" style={{ color: "#6366f1" }} />
            </div>
            <div className="text-center">
              <p className="text-white font-medium">No projects yet</p>
              <p className="text-sm mt-1" style={{ color: "#475569" }}>
                Create your first project to get started.
              </p>
            </div>
            <button
              onClick={openModal}
              className="flex items-center gap-2 text-sm font-medium text-white px-4 py-2 rounded-lg"
              style={{ backgroundColor: "#6366f1" }}
            >
              <Plus className="w-4 h-4" />
              New project
            </button>
          </div>
        )}

        {/* Project cards */}
        {!loading && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={() => openEdit(project)}
                onDelete={() => setDeleteProject(project)}
                onClick={() => router.push(`/projects/${project.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-6"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">New project</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                style={{ color: "#475569" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label
                  htmlFor="proj-name"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#94a3b8" }}
                >
                  Project name
                </label>
                <input
                  id="proj-name"
                  type="text"
                  required
                  placeholder="e.g. Tashkent City"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#1e2536")}
                />
              </div>

              <div>
                <label
                  htmlFor="proj-location"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#94a3b8" }}
                >
                  Location
                </label>
                <input
                  id="proj-location"
                  type="text"
                  required
                  placeholder="e.g. Yunusobod, Tashkent"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#1e2536")}
                />
              </div>

              {formError && (
                <p className="text-sm" style={{ color: "#fca5a5" }}>
                  {formError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
                  style={{ border: "1px solid #1e2536", color: "#64748b" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: "#6366f1" }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create project"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Edit modal ── */}
      {editProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-md rounded-2xl border p-6"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Edit project</h2>
              <button onClick={() => setEditProject(null)}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              {["name", "location"].map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>
                    {field === "name" ? "Project name" : "Location"}
                  </label>
                  <input type="text" required
                    value={editForm[field as keyof FormState]}
                    onChange={(e) => setEditForm((f) => ({ ...f, [field]: e.target.value }))}
                    className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                    style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                  />
                </div>
              ))}
              {editError && <p className="text-sm" style={{ color: "#fca5a5" }}>{editError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditProject(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                  style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                  Cancel
                </button>
                <button type="submit" disabled={editSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: "#6366f1" }}>
                  {editSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-2xl border p-6"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl mx-auto mb-4"
              style={{ backgroundColor: "#1f0a0a" }}>
              <Trash2 className="w-5 h-5" style={{ color: "#ef4444" }} />
            </div>
            <h2 className="text-base font-semibold text-white text-center mb-1">Delete project?</h2>
            <p className="text-sm text-center mb-5" style={{ color: "#64748b" }}>
              «{deleteProject.name}» will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteProject(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "#ef4444" }}>
                {deleting ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project, onEdit, onDelete, onClick,
}: {
  project: Project;
  onEdit:   () => void;
  onDelete: () => void;
  onClick:  () => void;
}) {
  const createdAt = new Date(project.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div
      onClick={onClick}
      className="project-card rounded-2xl flex flex-col gap-0 group cursor-pointer overflow-hidden"
      style={{
        backgroundColor: "#0d1117",
        border:          "1px solid rgba(255,255,255,0.07)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(99,102,241,0.15)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.4)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)";
      }}
    >
      {/* Gradient accent bar */}
      <div
        className="h-1 w-full"
        style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }}
      />
      <div className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
          style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))", border: "1px solid rgba(99,102,241,0.2)" }}
        >
          <Building2 className="w-5 h-5" style={{ color: "#6366f1" }} />
        </div>
        {/* Edit + Delete buttons */}
        <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: "#475569" }}
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
            style={{ color: "#475569" }}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs ml-1" style={{ color: "#334155" }}>{createdAt}</span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white leading-snug">{project.name}</h3>
        <div className="flex items-center gap-1 mt-1.5">
          <MapPin className="w-3 h-3 shrink-0" style={{ color: "#475569" }} />
          <span className="text-xs" style={{ color: "#64748b" }}>{project.location}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <span className="text-xs" style={{ color: "#475569" }}>Total buildings</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">
            {project.total_buildings ?? "—"}
          </span>
          <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: "#6366f1" }} />
        </div>
      </div>
      </div>{/* /p-5 wrapper */}
    </div>
  );
}
