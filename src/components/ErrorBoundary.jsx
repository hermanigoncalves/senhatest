import React from 'react';

export function FatalScreen({ title = 'Não foi possível iniciar o sistema', message }) {
  return (
    <main className="min-h-screen bg-cmip-950 grid place-items-center p-4 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-rose-500/40 bg-cmip-900/90 p-6">
        <h1 className="text-xl font-black">{title}</h1>
        <p className="my-3 text-rose-200">{message}</p>
        <button
          className="px-4 py-3 rounded-xl font-bold bg-cmip-500 text-cmip-950"
          onClick={() => window.location.reload()}
        >
          Recarregar
        </button>
      </div>
    </main>
  );
}

// Um erro de renderização não pode deixar a tela (ou a TV 24/7) em branco.
export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <FatalScreen
          title="Algo deu errado"
          message="Ocorreu um erro inesperado. Tente recarregar a página."
        />
      );
    }
    return this.props.children;
  }
}
