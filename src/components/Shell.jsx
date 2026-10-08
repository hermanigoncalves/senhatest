import React from 'react';
import { cmipApi } from '../utils/cmipApi';
import { LogOut } from 'lucide-react';
import { Button } from './ui';

export function Shell({ profile, children, onBeforeLogout }) {
  const logout = async () => {
    cmipApi.cleanupBroadcastChannels();
    try {
      if (onBeforeLogout) await onBeforeLogout();
    } catch (e) {
      console.warn('Falha ao encerrar contexto delegado antes do logout', e);
    } finally {
      if (profile.role === 'doctor') await cmipApi.signOutDoctor();
      else await cmipApi.signOut();
    }
  };
  return (
    <main className="min-h-screen bg-cmip-950 cmip-plus-pattern text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div className="flex gap-3 items-center">
            <img src="/logo.png" className="h-11 bg-white rounded-xl p-1" alt="CMIP" />
            <div>
              <b>{profile.full_name}</b>
              <p className="text-xs text-cmip-100/60 uppercase">{profile.role}</p>
            </div>
          </div>
          <Button className="bg-rose-900 text-rose-100" onClick={logout}>
            <LogOut className="inline w-4" /> Sair
          </Button>
        </header>
        {children}
      </div>
    </main>
  );
}
