import React from "react";
import { useI18n, LANGS } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe } from "lucide-react";

export function LanguageSwitcher({ compact = false }) {
  const { lang, setLang } = useI18n();
  return (
    <Select value={lang} onValueChange={setLang}>
      <SelectTrigger className={`h-9 gap-1 rounded-full border-border ${compact ? "w-[70px] px-2" : "w-[120px]"}`} data-testid="lang-switcher">
        <Globe className="w-4 h-4 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGS.map((l) => (
          <SelectItem key={l.code} value={l.code} data-testid={`lang-${l.code}`}>
            {compact ? l.code.toUpperCase() : l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
