import React from 'react';

// Cores padrão só quando o className não traz as suas: no Tailwind a ordem do CSS
// gerado (não a do className) decide o conflito, e text-cmip-950 vencia text-cmip-100.
export const Button = ({ children, className = '', ...p }) => {
  const defaults = /(^|\s)(bg|text)-/.test(className) ? '' : 'bg-cmip-500 text-cmip-950 hover:bg-cmip-400';
  return (
    <button className={`px-4 py-3 rounded-xl font-bold disabled:opacity-40 ${defaults} ${className}`} {...p}>
      {children}
    </button>
  );
};

// Cores dos botões de controle (cada ação com a sua, legível sobre o cartão verde-escuro).
export const buttonColors = {
  switch: 'bg-sky-600 text-white hover:bg-sky-500', // Trocar consultório
  end: 'bg-amber-500 text-cmip-950 hover:bg-amber-400', // Encerrar atendimento
  neutral: 'bg-slate-600 text-white hover:bg-slate-500', // Cancelar (voltar)
  logout: 'bg-cmip-red text-white hover:bg-cmip-red-hover', // Sair
};
export const Field = (p) => (
  <input
    className="w-full rounded-xl border border-cmip-600/50 bg-cmip-950 px-4 py-3 text-white outline-none focus:border-cmip-400"
    {...p}
  />
);
export const Card = ({ children, className = '' }) => (
  <section className={`rounded-3xl border border-cmip-600/30 bg-cmip-900/90 p-6 shadow-xl ${className}`}>
    {children}
  </section>
);
export { friendlyError as err } from '../utils/errors.js';
export { publicPatientName } from '../utils/patient.js';
