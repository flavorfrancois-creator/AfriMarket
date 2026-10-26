import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { getAdvertisingConsent, setAdvertisingConsent } from "@/lib/visitorPreferences";

export function VisitorConsent() {
  const [consent, setConsent] = useState(() => getAdvertisingConsent());
  const [open, setOpen] = useState(!consent);

  const choose = (value) => {
    setAdvertisingConsent(value);
    setConsent(value);
    setOpen(false);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-3 left-3 z-[60] rounded-full border border-border bg-card px-3 py-2 text-xs shadow-lg"
          data-testid="cookie-preferences"
        >
          Préférences cookies
        </button>
      )}
      {open && (
        <section className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-xl border border-border bg-card p-4 shadow-xl sm:inset-x-auto sm:right-4" role="dialog" aria-label="Préférences cookies">
          <h2 className="font-semibold">Vos préférences de confidentialité</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Le pays sert à afficher les offres locales et reste modifiable. Les cookies publicitaires optionnels ne sont déposés qu’avec votre accord.
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => choose("rejected")} data-testid="reject-ad-cookies">
              Refuser les cookies publicitaires
            </Button>
            <Button type="button" onClick={() => choose("accepted")} data-testid="accept-ad-cookies">
              Accepter
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
