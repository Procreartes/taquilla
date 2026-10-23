export const ESTADO_FUNCION: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: 'No está a la venta', clase: '' },
  a_la_venta: { texto: 'A la venta', clase: 'ok' },
  pausada: { texto: 'Venta pausada', clase: 'demo' },
  agotada: { texto: 'Agotada', clase: 'bad' },
  cancelada: { texto: 'Cancelada', clase: 'bad' },
  finalizada: { texto: 'Terminada', clase: '' },
};

export const MODO_VENTA: Record<string, string> = {
  numerada: 'Numerada',
  general: 'Aforo general',
  libre: 'Acceso libre',
};
