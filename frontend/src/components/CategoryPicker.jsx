import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function Propose({ parentId, label }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const send = async () => {
    try { const { data } = await api.post("/categories", { name, parent_id: parentId || null }); toast.success(data.message); setOpen(false); setName(""); }
    catch (e) { toast.error(apiErr(e)); }
  };
  if (!open) return <button type="button" className="text-[11px] text-primary hover:underline mt-1" onClick={() => setOpen(true)} data-testid={`propose-${parentId ? "sub" : "cat"}-btn`}>{label}</button>;
  return (
    <div className="flex gap-1 mt-1">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" placeholder="Nom proposé" data-testid={`propose-${parentId ? "sub" : "cat"}-input`} />
      <Button type="button" size="sm" className="h-8" disabled={!name.trim()} onClick={send} data-testid={`propose-${parentId ? "sub" : "cat"}-send`}>Proposer</Button>
    </div>
  );
}

export function CategoryPicker({ category, subcategory, onChange }) {
  const [cats, setCats] = useState([]);
  useEffect(() => { api.get("/categories").then((r) => setCats(r.data.categories)).catch(() => {}); }, []);
  const current = cats.find((c) => c.name === category);
  return (
    <div className="grid grid-cols-2 gap-3 col-span-2">
      <div><Label>Catégorie {!category && <span className="text-[10px] text-amber-700">(sans catégorie)</span>}</Label>
        <Select value={category || ""} onValueChange={(v) => onChange(v, "")}>
          <SelectTrigger className="mt-1" data-testid="prod-category"><SelectValue placeholder="Catégorie" /></SelectTrigger>
          <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Propose label="Proposer une catégorie" />
      </div>
      <div><Label>Sous-catégorie</Label>
        <Select value={subcategory || ""} onValueChange={(v) => onChange(category, v)} disabled={!current?.children?.length}>
          <SelectTrigger className="mt-1" data-testid="prod-subcategory"><SelectValue placeholder={current?.children?.length ? "Sous-catégorie" : "Aucune"} /></SelectTrigger>
          <SelectContent>{(current?.children || []).map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        {current && <Propose parentId={current.id} label="Proposer une sous-catégorie" />}
      </div>
    </div>
  );
}
