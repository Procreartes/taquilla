export class ErrorHttp extends Error {
  constructor(
    public status: number,
    message: string,
    public codigo?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const noEncontrado = (que = 'Recurso') => new ErrorHttp(404, `${que} no encontrado`, 'no_encontrado');
export const prohibido = (msg = 'No tienes permiso para hacer esto') => new ErrorHttp(403, msg, 'prohibido');
export const conflicto = (msg: string, codigo = 'conflicto', extra?: Record<string, unknown>) => new ErrorHttp(409, msg, codigo, extra);
export const invalido = (msg: string, extra?: Record<string, unknown>) => new ErrorHttp(400, msg, 'invalido', extra);
