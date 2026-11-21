'use client';

import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';

const DISMISS_KEY = 'micambio_install_dismissed';

/** Registra el service worker y ofrece instalar la app en el celular. */
export function InstallApp() {
  const [promptEvent, setPromptEvent] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {}
    if (standalone || dismissed) return;

    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    const mobile = /Android|iPhone|iPad|iPod/.test(ua);
    setIsIOS(ios);
    if (ios) setVisible(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e);
      if (mobile) setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };

  const install = async () => {
    if (isIOS) {
      setShowSteps(true);
      return;
    }
    if (!promptEvent) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice.catch(() => ({ outcome: 'dismissed' }));
    if (outcome === 'accepted') dismiss();
  };

  if (!visible) return null;

  return (
    <section className="card p-5 flex gap-4 items-start">
      <span className="w-11 h-11 rounded-xl bg-brand-soft text-brand flex items-center justify-center shrink-0">
        <Smartphone className="w-6 h-6" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-ink">Tené MiCambio como una app</p>
        {showSteps ? (
          <p className="text-[15px] text-ink-2 mt-1">
            En Safari tocá el botón <strong>Compartir</strong> (el cuadrado con la flecha) y después{' '}
            <strong>“Agregar a inicio”</strong>.
          </p>
        ) : (
          <p className="text-[15px] text-ink-2 mt-1">Se abre directo desde la pantalla del celular, sin buscar el link.</p>
        )}
        {!showSteps && (
          <button
            type="button"
            onClick={install}
            className="mt-3 h-11 px-5 rounded-xl bg-brand text-white text-base font-semibold hover:bg-brand-hover"
          >
            Instalar en el celular
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="-mr-2 -mt-2 p-2.5 rounded-full text-ink-3 hover:bg-fill"
        aria-label="No mostrar más"
      >
        <X className="w-5 h-5" />
      </button>
    </section>
  );
}
