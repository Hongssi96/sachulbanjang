const STORAGE_KEY = 'imleader.logout-notice';

// 로그아웃 직후 로그인 화면으로 이동할 때 안내를 한 번만 보여준다.
export function markLoggedOut(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // 저장소를 사용할 수 없는 환경에서는 안내만 생략한다.
  }
}

export function consumeLoggedOut(): boolean {
  try {
    const loggedOut = sessionStorage.getItem(STORAGE_KEY) === '1';
    sessionStorage.removeItem(STORAGE_KEY);
    return loggedOut;
  } catch {
    return false;
  }
}
