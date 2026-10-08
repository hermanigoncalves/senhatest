import React from 'react';

export const Button = ({ children, className = '', ...p }) => (
  <button
    className={`px-4 py-3 rounded-xl font-bold disabled:opacity-40 bg-cmip-500 text-cmip-950 hover:bg-cmip-400 ${className}`}
    {...p}
  >
    {children}
  </button>
);
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
export const err = (e) => e?.message || 'Não foi possível concluir a operação.';
export { publicPatientName } from '../utils/patient.js';
