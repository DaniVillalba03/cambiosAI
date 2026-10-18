'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Wallet } from 'lucide-react';

interface BankLogoProps {
  account: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const BANK_LOGO_CANDIDATES: Record<string, string[]> = {
  ueno: ['/banks/uenobank.png', '/banks/ueno.png', '/banks/ueno.webp', '/banks/ueno.jpg'],
  itau: ['/banks/bancoitau.png', '/banks/itau.png', '/banks/itau.webp', '/banks/itau.jpg'],
  familiar: ['/banks/bancofamiliar.png', '/banks/familiar.png', '/banks/familiar.webp', '/banks/familiar.jpg'],
  bnf: ['/banks/bnf.webp', '/banks/bnf.png', '/banks/bnf.jpg'],
  continental: ['/banks/bancocontinental.jpg', '/banks/bancocontinental.png', '/banks/continental.jpg', '/banks/continental.png'],
  efectivo: ['/banks/efectivo.svg', '/banks/efectivo.png', '/banks/efectivo.webp'],
};

export function BankLogo({ account, size = 'md', className }: BankLogoProps) {
  const sizeClasses = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  };

  const roundedClasses = {
    xs: 'rounded-md',
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
  };

  const acc = (account || '').toLowerCase();
  let slug = '';
  if (acc.includes('ueno')) slug = 'ueno';
  else if (acc.includes('itau') || acc.includes('itaú')) slug = 'itau';
  else if (acc.includes('familiar')) slug = 'familiar';
  else if (acc.includes('bnf') || acc.includes('fomento')) slug = 'bnf';
  else if (acc.includes('continental')) slug = 'continental';
  else if (acc.includes('efectivo') || acc.includes('pyg')) slug = 'efectivo';

  const candidates = slug ? (BANK_LOGO_CANDIDATES[slug] || []) : [];
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [failedAll, setFailedAll] = useState(false);

  const handleImageError = () => {
    if (candidateIdx < candidates.length - 1) {
      setCandidateIdx((prev) => prev + 1);
    } else {
      setFailedAll(true);
    }
  };

  const currentSrc = candidates[candidateIdx];

  // Si existe imagen cargada por el usuario en public/banks/
  if (slug && !failedAll && currentSrc) {
    return (
      <div
        className={cn(
          'relative overflow-hidden shrink-0 flex items-center justify-center select-none shadow-sm transition-transform duration-200 bg-white/95 border border-white/20',
          sizeClasses[size],
          roundedClasses[size],
          className
        )}
        title={account}
      >
        <img
          src={currentSrc}
          alt={account}
          onError={handleImageError}
          className="w-full h-full object-contain p-0.5"
          loading="lazy"
        />
      </div>
    );
  }

  // ─── Respaldo Isotipo CSS ───

  // Ueno Bank
  if (acc.includes('ueno')) {
    return (
      <div
        className={cn(
          'flex items-center justify-center font-black tracking-tighter shrink-0 select-none shadow-sm transition-transform duration-200',
          sizeClasses[size],
          roundedClasses[size],
          'bg-gradient-to-br from-[#7C3AED] via-[#6366F1] to-[#4F46E5] text-white ring-1 ring-violet-400/40 shadow-violet-500/20',
          className
        )}
        title="Ueno Bank"
      >
        <span className="font-sans font-extrabold lowercase leading-none translate-y-[-0.5px]">
          u<span className="text-[#38BDF8]">.</span>
        </span>
      </div>
    );
  }

  // Itaú
  if (acc.includes('itau') || acc.includes('itaú')) {
    return (
      <div
        className={cn(
          'flex items-center justify-center font-bold tracking-tight shrink-0 select-none shadow-sm transition-transform duration-200',
          sizeClasses[size],
          roundedClasses[size],
          'bg-[#EC7000] text-white ring-1 ring-orange-400/40 shadow-orange-500/20',
          className
        )}
        title="Banco Itaú"
      >
        <span className="font-sans font-black lowercase tracking-tighter text-white">
          i<span className="text-yellow-300">t</span>
        </span>
      </div>
    );
  }

  // Banco Familiar
  if (acc.includes('familiar')) {
    return (
      <div
        className={cn(
          'flex items-center justify-center font-black shrink-0 select-none shadow-sm transition-transform duration-200',
          sizeClasses[size],
          roundedClasses[size],
          'bg-gradient-to-br from-[#0284C7] via-[#0369A1] to-[#0C4A6E] text-white ring-1 ring-sky-400/40 shadow-sky-500/20',
          className
        )}
        title="Banco Familiar"
      >
        <span className="font-sans font-black tracking-tighter text-white">
          F<span className="text-sky-300">.</span>
        </span>
      </div>
    );
  }

  // BNF
  if (acc.includes('bnf') || acc.includes('fomento')) {
    return (
      <div
        className={cn(
          'flex items-center justify-center font-black tracking-tight shrink-0 select-none shadow-sm transition-transform duration-200',
          sizeClasses[size],
          roundedClasses[size],
          'bg-gradient-to-br from-[#DC2626] via-[#B91C1C] to-[#7F1D1D] text-white ring-1 ring-red-400/40 shadow-red-500/20',
          className
        )}
        title="Banco Nacional de Fomento (BNF)"
      >
        <span className="font-sans font-extrabold tracking-tight text-white text-[10px] leading-none">
          BNF
        </span>
      </div>
    );
  }

  // Continental
  if (acc.includes('continental')) {
    return (
      <div
        className={cn(
          'flex items-center justify-center font-black shrink-0 select-none shadow-sm transition-transform duration-200',
          sizeClasses[size],
          roundedClasses[size],
          'bg-gradient-to-br from-[#F59E0B] via-[#D97706] to-[#92400E] text-white ring-1 ring-amber-400/40 shadow-amber-500/20',
          className
        )}
        title="Banco Continental"
      >
        <span className="font-serif font-black text-white text-[11px] leading-none">
          C
        </span>
      </div>
    );
  }

  // Efectivo PYG
  if (acc.includes('pyg') || acc.includes('efectivo') || account === 'Efectivo Gs.') {
    return (
      <div
        className={cn(
          'flex items-center justify-center font-bold shrink-0 select-none shadow-sm transition-transform duration-200',
          sizeClasses[size],
          roundedClasses[size],
          'bg-gradient-to-br from-[#10B981] via-[#059669] to-[#047857] text-white ring-1 ring-emerald-400/40 shadow-emerald-500/20',
          className
        )}
        title="Efectivo en Guaraníes"
      >
        <span className="font-bold font-mono tracking-tighter text-white">₲</span>
      </div>
    );
  }

  // Default fallback
  return (
    <div
      className={cn(
        'flex items-center justify-center font-bold shrink-0 select-none shadow-sm',
        sizeClasses[size],
        roundedClasses[size],
        'bg-gray-800 text-gray-300 ring-1 ring-gray-700',
        className
      )}
    >
      <Wallet className="w-3.5 h-3.5 text-gray-400" />
    </div>
  );
}

interface BankPillProps {
  account: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function BankPill({ account, size = 'sm', className }: BankPillProps) {
  const isUeno = account.includes('Ueno');
  const isItau = account.includes('Itaú') || account.includes('Itau');
  const isFamiliar = account.includes('Familiar');
  const isBNF = account.includes('BNF');
  const isContinental = account.includes('Continental');
  const isCash = account.includes('Efectivo');

  const badgeBg = isUeno
    ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
    : isItau
    ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
    : isFamiliar
    ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
    : isBNF
    ? 'bg-red-500/10 border-red-500/30 text-red-300'
    : isContinental
    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
    : isCash
    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
    : 'bg-gray-800 border-gray-700 text-gray-300';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-medium text-xs',
        badgeBg,
        className
      )}
    >
      <BankLogo account={account} size="xs" />
      <span className="truncate">{account}</span>
    </div>
  );
}
