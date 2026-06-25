import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// Lightweight i18n: a flat key→string table per language, a provider that
// persists the choice, and a t(key, vars) helper. Default is Korean when the
// browser language is Korean, otherwise English; the user can toggle.

export type Lang = 'ko' | 'en';

const STRINGS: Record<Lang, Record<string, string>> = {
  ko: {
    'app.subtitle': '캐주얼 실시간 멀티플레이어 보드게임',
    'app.settings': '⚙️ 설정',
    'app.close': '✕ 닫기',
    'app.settingsTitle': '⚙️ 설정',
    'app.indexedDbWarn':
      'IndexedDB 차단/미지원: 암호화 프로필과 게임 기록이 브라우저를 닫으면 저장되지 않습니다(주로 시크릿 모드). 일반 모드로 열어주세요.',
    'app.footer': '© 2026 BoardLink. 추적·서드파티 쿠키 없음.',

    'common.you': '나',
    'common.cpu': '컴퓨터',

    'invite.title': '✉️ 초대를 받았습니다',
    'invite.desc':
      '보드게임 세션에 초대되었습니다. 이 미리보기 페이지는 인앱 브라우저에서도 안전하게 동작합니다.',
    'invite.token': '토큰',
    'invite.enter': '게임 방 입장',

    'e2e.title': '⚙️ E2E 목 설정 (개발용)',
    'e2e.mockContext': '목 컨텍스트:',
    'e2e.browser': '브라우저',
    'e2e.inApp': '인앱',
    'e2e.pwa': 'PWA',
    'e2e.mockStorage': '목 저장소 차단:',
    'e2e.blocked': '차단됨',
    'e2e.allow': '허용',
    'e2e.swUpdate': 'SW 업데이트:',
    'e2e.deferred': '연기됨 (매치 중)',
    'e2e.available': '사용 가능',
    'e2e.upToDate': '최신',
    'e2e.simulate': '업데이트 모의 실행',
    'e2e.action': '동작:',
    'e2e.reloadApply': '새로고침하여 업데이트 적용',

    'lookup.placeholder': '예: ABCD-1234',

    'profile.title': '👤 기기 프로필',
    'profile.displayName': '표시 이름',
    'profile.publicId': '공개 ID',
    'profile.storage': '저장 상태',
    'profile.persistent': '영구',
    'profile.temporary': '임시',
    'profile.friendCode': '친구 코드',
    'profile.issue': '친구 코드 발급',
    'profile.rotate': '교체',
    'profile.revoke': '폐기',
    'profile.reset': '프로필 초기화',
    'profile.generating': '익명 암호화 키 생성 중...',

    'lookup.title': '🔍 친구 코드 검색',
    'lookup.desc': '친구의 코드를 입력해 공개 프로필 ID를 찾습니다.',
    'lookup.search': '검색',
    'lookup.searching': '검색 중...',
    'lookup.found': '사용자 찾음:',
    'lookup.notfound': '❌ 친구 코드를 찾을 수 없거나 만료되었습니다.',
    'lookup.ratelimit': '⚠️ 검색이 너무 잦습니다. 잠시 후 다시 시도하세요.',
    'lookup.error': '❌ 검색 실패:',

    'system.title': '시스템 상태',
    'system.protocol': '프로토콜 버전',
    'system.build': '빌드 ID',
    'system.leader': '리더 상태',
    'system.leaderOn': '리더',
    'system.leaderOff': '비활성',
    'system.service': '서비스 상태',
    'system.online': '온라인',

    'online.title': '🌐 온라인 플레이',
    'online.desc': '방을 만들어 코드를 공유하거나, 친구의 방에 입장하세요.',
    'online.game': '게임',
    'online.create': '방 만들기',
    'online.creating': '생성 중…',
    'online.joinLabel': '코드로 입장',
    'online.join': '입장',
    'online.identityNotReady': '신원이 아직 준비되지 않았습니다.',
    'online.preparing': '신원 준비 중…',
    'online.room': '방',
    'online.connected': '연결됨',
    'online.connecting': '연결 중…',
    'online.disconnected': '연결 끊김',
    'online.share': '이 코드를 공유하세요',
    'online.players': '플레이어',
    'online.ready': '준비됨',
    'online.notReady': '준비 안 됨',
    'online.imReady': '준비 완료',
    'online.cancelReady': '준비 취소',
    'online.ownerStart': '매치 시작 (방장)',
    'online.startMatch': '매치 시작',
    'online.waiting': '다른 플레이어를 기다리는 중…',
    'online.leave': '방 나가기',
    'online.yourTurn': '내 차례',
    'online.oppTurn': '상대 차례',
    'online.loading': '매치 불러오는 중…',
    'online.noRenderer': '매치 진행 중 ({game}). 아직 보드 렌더러가 없습니다.',

    'vs.title': '🤖 컴퓨터와 대결',
    'vs.desc': '상대가 없나요? 컴퓨터와 대결하세요 — 게임과 난이도를 고르세요.',
    'vs.game': '게임',
    'vs.difficulty': '난이도',
    'vs.easy': '쉬움',
    'vs.medium': '보통',
    'vs.hard': '어려움',
    'vs.bingoNoDiff': '빙고는 운 게임이라 난이도 설정이 없습니다.',
    'vs.start': '게임 시작',
    'vs.newGame': '새 게임',
    'vs.changeGame': '게임 변경',
    'vs.yourTurn': '내 차례',
    'vs.thinking': '컴퓨터가 생각 중…',
    'vs.youWin': '🎉 승리!',
    'vs.youLose': '💻 컴퓨터 승리',
    'vs.draw': '🤝 무승부',
    'vs.vsLabel': '컴퓨터와 대결',

    'bingo.drawBtn': '뽑기',
    'bingo.bingo': '빙고!',
    'bingo.yourTurn': '내 차례 — 숫자를 뽑으세요',
    'bingo.cpuTurn': '컴퓨터 차례…',
    'bingo.win': '🎉 빙고! 승리!',
    'bingo.lose': '💻 컴퓨터가 빙고',
    'bingo.drawResult': '🤝 무승부',
    'bingo.called': '뽑힌 수:',

    'bubble.round': '라운드',
    'bubble.attacker': '공격',
    'bubble.defender': '수비',
    'bubble.starting': '라운드 {n} 시작… {s}',
    'bubble.attackHint': '공격! 빈 공간을 탭해 공을 생성 — 끝까지 살리세요 ({s}초)',
    'bubble.defendHint': '수비! 시간이 끝나기 전에 공을 탭해 터뜨리세요 ({s}초)',
    'bubble.roundOver': '라운드 종료',
  },
  en: {
    'app.subtitle': 'Casual Real-Time Multiplayer Board Games',
    'app.settings': '⚙️ Settings',
    'app.close': '✕ Close',
    'app.settingsTitle': '⚙️ Settings',
    'app.indexedDbWarn':
      'IndexedDB blocked or unsupported: your cryptographic profile and game stats will not be saved after closing the browser (often Private/Incognito mode). Please use a normal browsing window.',
    'app.footer': '© 2026 BoardLink. No tracking or third-party cookies.',

    'common.you': 'You',
    'common.cpu': 'CPU',

    'invite.title': '✉️ Invitation Received',
    'invite.desc':
      'You have been invited to join a board game session. This preview page is safe inside in-app browsers.',
    'invite.token': 'Token',
    'invite.enter': 'Enter Game Room',

    'e2e.title': '⚙️ E2E Mock Settings (dev)',
    'e2e.mockContext': 'Mock Context:',
    'e2e.browser': 'Browser',
    'e2e.inApp': 'In-App',
    'e2e.pwa': 'PWA',
    'e2e.mockStorage': 'Mock Storage Block:',
    'e2e.blocked': 'BLOCKED',
    'e2e.allow': 'ALLOW',
    'e2e.swUpdate': 'SW Update:',
    'e2e.deferred': 'Deferred (In Match)',
    'e2e.available': 'Available',
    'e2e.upToDate': 'Up to Date',
    'e2e.simulate': 'Simulate Update',
    'e2e.action': 'Action:',
    'e2e.reloadApply': 'Reload & Apply Update',

    'lookup.placeholder': 'e.g. ABCD-1234',

    'profile.title': '👤 Device Profile',
    'profile.displayName': 'Display Name',
    'profile.publicId': 'Public ID',
    'profile.storage': 'Storage Status',
    'profile.persistent': 'PERSISTENT',
    'profile.temporary': 'TEMPORARY',
    'profile.friendCode': 'Friend Code',
    'profile.issue': 'Issue Friend Code',
    'profile.rotate': 'Rotate',
    'profile.revoke': 'Revoke',
    'profile.reset': 'Reset Profile Identity',
    'profile.generating': 'Generating accountless cryptographic keys...',

    'lookup.title': '🔍 Search Friend Code',
    'lookup.desc': "Enter a friend's code to look up their public profile ID.",
    'lookup.search': 'Search',
    'lookup.searching': 'Searching...',
    'lookup.found': 'User Found:',
    'lookup.notfound': '❌ Friend code not found or expired.',
    'lookup.ratelimit': '⚠️ Too many lookups. Please wait a minute.',
    'lookup.error': '❌ Search failed:',

    'system.title': 'System Status',
    'system.protocol': 'Protocol Version',
    'system.build': 'Build ID',
    'system.leader': 'Leader Status',
    'system.leaderOn': 'LEADER',
    'system.leaderOff': 'INACTIVE',
    'system.service': 'Service Status',
    'system.online': 'ONLINE',

    'online.title': '🌐 Play Online',
    'online.desc': "Create a room and share the code, or join a friend's room.",
    'online.game': 'Game',
    'online.create': 'Create Room',
    'online.creating': 'Creating…',
    'online.joinLabel': 'Join with a code',
    'online.join': 'Join',
    'online.identityNotReady': 'Identity not ready yet.',
    'online.preparing': 'Preparing your identity…',
    'online.room': 'Room',
    'online.connected': 'Connected',
    'online.connecting': 'Connecting…',
    'online.disconnected': 'Disconnected',
    'online.share': 'Share this code',
    'online.players': 'Players',
    'online.ready': 'Ready',
    'online.notReady': 'Not ready',
    'online.imReady': "I'm Ready",
    'online.cancelReady': 'Cancel Ready',
    'online.ownerStart': 'Start a match (owner)',
    'online.startMatch': 'Start Match',
    'online.waiting': 'Waiting for another player…',
    'online.leave': 'Leave Room',
    'online.yourTurn': 'Your turn',
    'online.oppTurn': "Opponent's turn",
    'online.loading': 'Loading match…',
    'online.noRenderer': 'Match in progress ({game}). No board renderer yet.',

    'vs.title': '🤖 Play vs Computer',
    'vs.desc': 'No opponent around? Play against the computer — pick a game and difficulty.',
    'vs.game': 'Game',
    'vs.difficulty': 'Difficulty',
    'vs.easy': 'Easy',
    'vs.medium': 'Medium',
    'vs.hard': 'Hard',
    'vs.bingoNoDiff': 'Bingo is a game of luck — no difficulty setting.',
    'vs.start': 'Start Game',
    'vs.newGame': 'New Game',
    'vs.changeGame': 'Change Game',
    'vs.yourTurn': 'Your turn',
    'vs.thinking': 'Computer thinking…',
    'vs.youWin': '🎉 You win!',
    'vs.youLose': '💻 Computer wins',
    'vs.draw': '🤝 Draw',
    'vs.vsLabel': 'vs Computer',

    'bingo.drawBtn': 'Draw',
    'bingo.bingo': 'Bingo!',
    'bingo.yourTurn': 'Your turn — draw a number',
    'bingo.cpuTurn': 'Computer is playing…',
    'bingo.win': '🎉 Bingo! You win!',
    'bingo.lose': '💻 Computer got Bingo',
    'bingo.drawResult': '🤝 Draw',
    'bingo.called': 'Called:',

    'bubble.round': 'Round',
    'bubble.attacker': 'ATTACK',
    'bubble.defender': 'DEFEND',
    'bubble.starting': 'Round {n} starting… {s}',
    'bubble.attackHint': 'Attack! Tap empty space to spawn balls — keep them alive ({s}s)',
    'bubble.defendHint': 'Defend! Tap balls to pop them before time runs out ({s}s)',
    'bubble.roundOver': 'Round over',
  },
};

function detectLang(): Lang {
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ko')) {
    return 'ko';
  }
  return 'en';
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('boardlink-lang');
    if (saved === 'ko' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  return detectLang();
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('boardlink-lang', l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback<TFn>(
    (key, vars) => {
      let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      }
      return s;
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
