import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { PageHeader, Loading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";

const run = async (fn, msg) => {
  try { const r = await fn(); toast.success(r?.data?.message || msg); return true; } catch (e) { toast.error(apiErr(e)); return false; }
};

function NameEditor({ initial, onSave, onCancel, testid }) {
  const [v, setV] = useState(initial || "");
  return (
    <div className="flex items-center gap-2">
      <Input value={v} onChange={(e) => setV(e.target.value)} className="h-8 max-w-xs" autoFocus data-testid={`${testid}-input`}
        onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) onSave(v.trim()); }} />
      <Button size="icon" variant="ghost" disabled={!v.trim()} onClick={() => onSave(v.trim())} data-testid={`${testid}-save`}><Check className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" onClick={onCancel}><X className="w-4 h-4" /></Button>
    </div>
  );
}

function CatRow({ c, child, reload }) {
  const [edit, setEdit] = useState(false);
  const del = async () => {
    const msg = child ? `Supprimer la sous-catégorie « ${c.name} » ? Les ${c.products} article(s) concernés perdront leur sous-catégorie.`
      : `Supprimer « ${c.name} » et ses sous-catégories ? Les ${c.products} article(s) passeront dans « Sans catégorie ».`;
    if (window.confirm(msg) && await run(() => api.delete(`/admin/categories/${c.id}`), "Supprimée")) reload();
  };
  return (
    <div className={`flex items-center gap-3 py-2 ${child ? "pl-8" : ""}`} data-testid={`category-row-${c.id}`}>
      {child && <ChevronRight className="w-3 h-3 text-muted-foreground -ml-5" />}
      <div className="flex-1 min-w-0">
        {edit ? <NameEditor initial={c.name} testid={`category-rename-${c.id}`} onCancel={() => setEdit(false)}
          onSave={async (name) => { if (await run(() => api.put(`/admin/categories/${c.id}`, { name }), "Renommée")) { setEdit(false); reload(); } }} />
          : <span className={`${child ? "text-sm" : "font-semibold"} ${c.active ? "" : "text-muted-foreground line-through"}`}>{c.name}</span>}
        <span className="text-xs text-muted-foreground ml-2">{c.products} article(s)</span>
      </div>
      <Switch checked={c.active} onCheckedChange={async (v) => { if (await run(() => api.put(`/admin/categories/${c.id}`, { active: v }), v ? "Activée" : "Désactivée")) reload(); }} data-testid={`category-active-${c.id}`} />
      <Button size="icon" variant="ghost" onClick={() => setEdit(true)} data-testid={`category-edit-${c.id}`}><Pencil className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" onClick={del} data-testid={`category-delete-${c.id}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
    </div>
  );
}

function CategoryBlock({ cat, subs, reload }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-2" data-testid={`category-block-${cat.id}`}>
      <CatRow c={cat} reload={reload} />
      <div className="divide-y divide-border/50">{subs.map((s) => <CatRow key={s.id} c={s} child reload={reload} />)}</div>
      <div className="pl-8 py-2">
        {adding ? <NameEditor testid={`subcategory-new-${cat.id}`} onCancel={() => setAdding(false)}
          onSave={async (name) => { if (await run(() => api.post("/admin/categories", { name, parent_id: cat.id }), "Sous-catégorie créée")) { setAdding(false); reload(); } }} />
          : <Button size="sm" variant="ghost" className="text-primary" onClick={() => setAdding(true)} data-testid={`subcategory-add-${cat.id}`}><Plus className="w-4 h-4 mr-1" />Sous-catégorie</Button>}
      </div>
    </div>
  );
}

function Proposals({ list, parents, reload }) {
  if (!list.length) return null;
  const decide = async (id, decision) => { if (await run(() => api.put(`/admin/categories/${id}/decision`, { decision }), "Traitée")) reload(); };
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4" data-testid="category-proposals">
      <h3 className="font-display font-bold mb-2">Propositions des commerçants ({list.length})</h3>
      {list.map((p) => (
        <div key={p.id} className="flex items-center gap-3 py-1.5 text-sm" data-testid={`proposal-${p.id}`}>
          <span className="flex-1"><strong>{p.name}</strong>{p.parent_id && <span className="text-muted-foreground"> dans {parents[p.parent_id] || "?"}</span>} <span className="text-xs text-muted-foreground">— {p.proposer_name}</span></span>
          <Button size="sm" className="rounded-full h-7" onClick={() => decide(p.id, "APPROVE")} data-testid={`proposal-approve-${p.id}`}>Valider</Button>
          <Button size="sm" variant="outline" className="rounded-full h-7" onClick={() => decide(p.id, "REJECT")} data-testid={`proposal-reject-${p.id}`}>Refuser</Button>
        </div>
      ))}
    </div>
  );
}

export function AdminCategories() {
  const [data, setData] = useState(null);
  const [name, setName] = useState("");
  const load = () => api.get("/admin/categories").then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);
  if (!data) return <Loading />;
  const approved = data.categories.filter((c) => c.status === "APPROVED");
  const parents = approved.filter((c) => !c.parent_id);
  const names = Object.fromEntries(data.categories.map((c) => [c.id, c.name]));
  const create = async () => { if (await run(() => api.post("/admin/categories", { name }), "Catégorie créée")) { setName(""); load(); } };
  return (
    <div>
      <PageHeader title="Catégories" subtitle={`${parents.length} catégories · ${approved.length - parents.length} sous-catégories`} />
      <div className="space-y-4 max-w-4xl">
        {data.uncategorized > 0 && <Badge variant="secondary" data-testid="uncategorized-count">{data.uncategorized} article(s) « Sans catégorie » à réattribuer par les commerçants</Badge>}
        <Proposals list={data.categories.filter((c) => c.status === "PENDING")} parents={names} reload={load} />
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle catégorie" className="max-w-sm" data-testid="category-new-name"
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create(); }} />
          <Button className="rounded-full" disabled={!name.trim()} onClick={create} data-testid="category-create-btn"><Plus className="w-4 h-4 mr-1" />Ajouter</Button>
        </div>
        {parents.map((p) => <CategoryBlock key={p.id} cat={p} subs={approved.filter((s) => s.parent_id === p.id)} reload={load} />)}
      </div>
    </div>
  );
}
