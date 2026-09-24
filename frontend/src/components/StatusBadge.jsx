import React from "react";
import { Badge } from "@/components/ui/badge";

const MAP = {
  // Orders
  NOUVELLE: "bg-blue-100 text-blue-800",
  EN_ATTENTE: "bg-amber-100 text-amber-800",
  APPROUVEE: "bg-indigo-100 text-indigo-800",
  EN_PREPARATION: "bg-purple-100 text-purple-800",
  PRETE: "bg-cyan-100 text-cyan-800",
  EXPEDIEE: "bg-teal-100 text-teal-800",
  LIVREE: "bg-green-100 text-green-800",
  ANNULEE: "bg-gray-200 text-gray-700",
  REJETEE: "bg-red-100 text-red-800",
  REMBOURSEE: "bg-orange-100 text-orange-800",
  PARTIELLEMENT_REMBOURSEE: "bg-orange-100 text-orange-800",
  // Shops
  DRAFT: "bg-gray-200 text-gray-700",
  SUBMITTED: "bg-amber-100 text-amber-800",
  UNDER_REVIEW: "bg-indigo-100 text-indigo-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  // KYC
  NONE: "bg-gray-100 text-gray-600",
  EN_VERIFICATION: "bg-indigo-100 text-indigo-800",
  APPROUVE: "bg-green-100 text-green-800",
  REJETE: "bg-red-100 text-red-800",
  DOCUMENT_EXPIRE: "bg-orange-100 text-orange-800",
  // Withdrawals
  DEMANDE: "bg-amber-100 text-amber-800",
  REFUSE: "bg-red-100 text-red-800",
  TRAITE: "bg-green-100 text-green-800",
  ANNULE: "bg-gray-200 text-gray-700",
  // Customer types
  SIMPLE: "bg-slate-100 text-slate-700",
  PARTENAIRE: "bg-blue-100 text-blue-800",
  PROFESSIONNEL: "bg-purple-100 text-purple-800",
  ENTREPRISE: "bg-primary/15 text-primary",
  PENDING: "bg-amber-100 text-amber-800",
  AVAILABLE: "bg-green-100 text-green-800",
  // Account / approvals status
  ACTIVE: "bg-green-100 text-green-800",
  SUSPENDED: "bg-amber-100 text-amber-800",
  DISABLED: "bg-gray-200 text-gray-700",
  // Product moderation / reports
  OPEN: "bg-amber-100 text-amber-800",
  RESOLVED: "bg-green-100 text-green-800",
  DISMISSED: "bg-gray-200 text-gray-700",
};

export function StatusBadge({ status }) {
  const cls = MAP[status] || "bg-gray-100 text-gray-700";
  return (
    <Badge className={`${cls} border-0 rounded-full font-medium hover:${cls}`} data-testid={`status-${status}`}>
      {String(status || "").replace(/_/g, " ")}
    </Badge>
  );
}
