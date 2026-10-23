import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr, downloadFile } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/common";
import { StatusBadge, ACCOUNT_REQ_LABELS } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";

const d = (s) => (s ? new Date(s).toLocaleDateString("fr-FR") : "—");
const act = async (fn, reload) => {
  try { const { data } = await fn(); toast.success(data.message); reload(); } catch (e) { toast.error(apiErr(e)); }
};
const Approvals = ({ list }) => (
  <span className="text-xs" title={list.map((a) => a.by_name).join(", ")}>{list.length}/2{list.length ? ` (${list.map((a) => a.by_name).join(", ")})` : ""}</span>
);

function DeletionRequests() {
  const [rows, setRows] = useState(null);
  const load = () => api.get("/admin/deletion-requests").then((r) => setRows(r.data.requests)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  if (rows === null) return null;
  if (!rows.length) return <EmptyState title="Aucune demande de suppression" />;
  const download = async (r) => {
    try { await downloadFile(`/admin/deletion-requests/${r.id}/history`, `historique_${r.user_name || r.user_id}.xlsx`); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const reject = (r) => { const note = window.prompt("Motif du refus (facultatif)") ?? null; if (note !== null) act(() => api.put(`/admin/deletion-requests/${r.id}`, { decision: "REJECT", note }), load); };
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Utilisateur</TableHead><TableHead>Rôle</TableHead><TableHead>Raison</TableHead><TableHead>Statut</TableHead><TableHead>Approbations</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (
          <TableRow key={r.id} data-testid={`deletion-row-${r.id}`}>
            <TableCell className="text-xs">{d(r.created_at)}</TableCell>
            <TableCell className="text-sm"><div className="font-medium">{r.user_name}</div><div className="text-xs text-muted-foreground">{r.email}</div></TableCell>
            <TableCell className="text-xs">{r.role}</TableCell>
            <TableCell className="text-xs max-w-[200px] truncate">{r.reason || "—"}</TableCell>
            <TableCell><StatusBadge status={r.status} label={ACCOUNT_REQ_LABELS[r.status]} /></TableCell>
            <TableCell><Approvals list={r.approvals} /></TableCell>
            <TableCell className="whitespace-nowrap space-x-1">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => download(r)} data-testid={`deletion-history-${r.id}`}>
                <Download className="w-3.5 h-3.5 mr-1" />Historique{r.downloaded_by_me && " ✓"}
              </Button>
              {r.status === "PENDING" && !r.approved_by_me && (<>
                <Button size="sm" className="rounded-full" disabled={!r.downloaded_by_me} title={r.downloaded_by_me ? "" : "Téléchargez d'abord l'historique"}
                  onClick={() => act(() => api.put(`/admin/deletion-requests/${r.id}`, { decision: "APPROVE" }), load)} data-testid={`deletion-approve-${r.id}`}>Approuver</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => reject(r)} data-testid={`deletion-reject-${r.id}`}>Refuser</Button>
              </>)}
              {r.approved_by_me && r.status === "PENDING" && <Badge variant="secondary">Approuvée par vous</Badge>}
            </TableCell>
          </TableRow>))}
        </TableBody>
      </Table>
    </div>
  );
}

function RestoreRequests() {
  const [rows, setRows] = useState(null);
  const load = () => api.get("/admin/restore-requests").then((r) => setRows(r.data.requests)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  if (rows === null) return null;
  if (!rows.length) return <EmptyState title="Aucune demande de restauration" description="Créée automatiquement quand un nouvel inscrit correspond à un compte supprimé depuis moins de 3 mois." />;
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Nouvelle inscription</TableHead><TableHead>Supprimé le</TableHead><TableHead>Purge prévue</TableHead><TableHead>Statut</TableHead><TableHead>Approbations</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (
          <TableRow key={r.id} data-testid={`restore-row-${r.id}`}>
            <TableCell className="text-xs">{d(r.created_at)}</TableCell>
            <TableCell className="text-sm"><div className="font-medium">{r.new_name}</div><div className="text-xs text-muted-foreground">{r.new_email} {r.new_phone}</div></TableCell>
            <TableCell className="text-xs">{d(r.deleted_at)}</TableCell>
            <TableCell className="text-xs">{d(r.purge_after)}</TableCell>
            <TableCell><StatusBadge status={r.status} label={ACCOUNT_REQ_LABELS[r.status]} /></TableCell>
            <TableCell><Approvals list={r.approvals} /></TableCell>
            <TableCell className="whitespace-nowrap space-x-1">{r.status === "PENDING" && !r.approved_by_me && (<>
              <Button size="sm" className="rounded-full" onClick={() => act(() => api.put(`/admin/restore-requests/${r.id}`, { decision: "APPROVE" }), load)} data-testid={`restore-approve-${r.id}`}>Approuver</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act(() => api.put(`/admin/restore-requests/${r.id}`, { decision: "REJECT" }), load)} data-testid={`restore-reject-${r.id}`}>Refuser</Button>
            </>)}{r.approved_by_me && r.status === "PENDING" && <Badge variant="secondary">Approuvée par vous</Badge>}</TableCell>
          </TableRow>))}
        </TableBody>
      </Table>
    </div>
  );
}

function DeletedAccounts() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/deleted-accounts").then((r) => setData(r.data)).catch(() => setData({ accounts: [] })); }, []);
  if (!data) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Comptes anonymisés, effacés complètement {data.restore_days} jours après la suppression (purge quotidienne à 03:00 UTC{data.last_purge ? `, dernier passage ${new Date(data.last_purge).toLocaleString("fr-FR")}` : ""}).</p>
      {!data.accounts.length ? <EmptyState title="Aucun compte supprimé" /> : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Rôle</TableHead><TableHead>Supprimé le</TableHead><TableHead>Effacement total le</TableHead></TableRow></TableHeader>
            <TableBody>{data.accounts.map((a) => (
              <TableRow key={a.id} data-testid={`deleted-account-${a.user_id}`}><TableCell className="font-mono text-xs">{a.user_id}</TableCell><TableCell className="text-xs">{a.role}</TableCell><TableCell className="text-xs">{d(a.deleted_at)}</TableCell><TableCell className="text-xs">{d(a.purge_after)}</TableCell></TableRow>))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function AdminAccountDeletions() {
  return (
    <div>
      <PageHeader title="Suppressions de comptes" subtitle="Double approbation administrateur, après consultation de l'historique d'activité" />
      <Tabs defaultValue="deletions">
        <TabsList><TabsTrigger value="deletions" data-testid="tab-deletions">Demandes de suppression</TabsTrigger><TabsTrigger value="restores" data-testid="tab-restores">Restaurations</TabsTrigger><TabsTrigger value="deleted" data-testid="tab-deleted">Comptes supprimés</TabsTrigger></TabsList>
        <TabsContent value="deletions" className="mt-4"><DeletionRequests /></TabsContent>
        <TabsContent value="restores" className="mt-4"><RestoreRequests /></TabsContent>
        <TabsContent value="deleted" className="mt-4"><DeletedAccounts /></TabsContent>
      </Tabs>
    </div>
  );
}
