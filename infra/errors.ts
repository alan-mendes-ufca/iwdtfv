type ErrorParams = {
  message?: string;
  action?: string;
  cause?: unknown;
};

abstract class PublicError extends Error {
  action: string;
  statusCode: number;

  constructor(
    { message, action, cause }: ErrorParams,
    defaults: {
      name: string;
      message: string;
      action: string;
      statusCode: number;
    },
  ) {
    super(message || defaults.message, { cause });
    this.name = defaults.name;
    this.action = action || defaults.action;
    this.statusCode = defaults.statusCode;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      action: this.action,
      status_code: this.statusCode,
    };
  }
}

export class InternalServerError extends PublicError {
  constructor({ cause }: { cause?: unknown } = {}) {
    super(
      { cause },
      {
        name: "InternalServerError",
        message: "Um erro interno não esperado aconteceu.",
        action: "Tente novamente. Se persistir, veja os logs do servidor.",
        statusCode: 500,
      },
    );
  }
}

export class ServicesError extends PublicError {
  constructor(params: ErrorParams = {}) {
    super(params, {
      name: "ServiceError",
      message: "Serviço indisponível no momento.",
      action: "Verifique se o serviço está disponível.",
      statusCode: 503,
    });
  }
}

export class MethodNotAllowedError extends PublicError {
  constructor() {
    super(
      {},
      {
        name: "MethodNotAllowedError",
        message: "Método não permitido para este endpoint.",
        action: "Verifique o método HTTP enviado para esse endpoint.",
        statusCode: 405,
      },
    );
  }
}

export class ValidationError extends PublicError {
  constructor(params: ErrorParams = {}) {
    super(params, {
      name: "ValidationError",
      message: "Erro de validação.",
      action: "Verifique os dados enviados.",
      statusCode: 400,
    });
  }
}

export class UnsupportedPlatformError extends PublicError {
  constructor(params: ErrorParams = {}) {
    super(params, {
      name: "UnsupportedPlatformError",
      message: "Plataforma não suportada.",
      action: "Use um link do YouTube, X, TikTok ou Instagram.",
      statusCode: 422,
    });
  }
}

export class VideoUnavailableError extends PublicError {
  constructor(params: ErrorParams = {}) {
    super(params, {
      name: "VideoUnavailableError",
      message: "O vídeo é privado, foi removido ou não está disponível.",
      action: "Confira se o vídeo abre no navegador sem login.",
      statusCode: 404,
    });
  }
}

export class LoginRequiredError extends PublicError {
  constructor(params: ErrorParams = {}) {
    super(params, {
      name: "LoginRequiredError",
      message: "A plataforma exige login para liberar este vídeo.",
      action:
        "Configure YTDLP_COOKIES_FILE com um arquivo de cookies da sua conta.",
      statusCode: 403,
    });
  }
}

export class TooManyRequestsError extends PublicError {
  constructor(params: ErrorParams = {}) {
    super(params, {
      name: "TooManyRequestsError",
      message: "Muitas requisições em pouco tempo.",
      action: "Aguarde um minuto e tente novamente.",
      statusCode: 429,
    });
  }
}

export class YtDlpFailedError extends PublicError {
  constructor(params: ErrorParams & { statusCode?: number } = {}) {
    super(params, {
      name: "YtDlpFailedError",
      message: "O yt-dlp não conseguiu processar este vídeo.",
      action: "Tente novamente. Se persistir, atualize o yt-dlp.",
      statusCode: params.statusCode || 502,
    });
  }
}
