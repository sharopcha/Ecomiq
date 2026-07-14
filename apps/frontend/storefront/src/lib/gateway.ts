import 'server-only';
import { cookies } from 'next/headers';
import { env } from './env';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = 'Unauthenticated') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

interface FetchOptions extends RequestInit {
  auth?: boolean;
  next?: NextFetchRequestConfig;
}

export async function gatewayFetch<T = any>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { auth, next, ...customConfig } = options;
  const cookieStore = await cookies();
  const headers = new Headers(customConfig.headers);

  // Auto-forward session cookies if we might need them.
  // We forward both sf_access and sf_refresh so the gateway can do its thing.
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
  }

  // Force no-store for authenticated requests
  const cacheOptions: RequestInit = auth
    ? { cache: 'no-store' }
    : next
    ? { next }
    : {};

  const config: RequestInit = {
    ...customConfig,
    headers,
    ...cacheOptions,
  };

  const url = `${env.GATEWAY_INTERNAL_URL}${path}`;

  try {
    let response = await fetch(url, config);

    // Naive 401 handling for now. Proper refresh logic will be in Step 6 (Session model).
    if (response.status === 401 && auth) {
      // In step 6 we'll add the refresh token attempt here.
      // For now just throw UnauthenticatedError.
      throw new UnauthenticatedError();
    }

    if (!response.ok) {
      let message = 'Gateway Error';
      try {
        const errorData = await response.json();
        message = errorData.message || message;
      } catch (e) {
        // ignore
      }
      throw new ApiError(response.status, message);
    }

    // Some endpoints might return 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError || error instanceof UnauthenticatedError) {
      throw error;
    }
    throw new ApiError(500, 'Internal Server Error');
  }
}
