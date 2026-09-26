import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthApi } from '../data/auth-api';

/** Blocks access to app routes until the user is signed in. */
export const authGuard: CanActivateFn = (_route, state) => {
  const authApi = inject(AuthApi);
  const router = inject(Router);

  if (authApi.isSignedIn()) {
    return true;
  }

  return router.createUrlTree(['/login'], { 
    queryParams: { returnUrl: state.url } 
  });
};
