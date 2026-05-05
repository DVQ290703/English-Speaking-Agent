export type Lang = 'en' | 'vi';

type Dict = Record<string, string>;

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  let value = dict[key];
  if (value === undefined) {
    value = TRANSLATIONS.en[key];
  }
  if (value === undefined) return key;
  if (vars) {
    return value.replace(/\{(\w+)\}/g, (_, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`,
    );
  }
  return value;
}

export const TRANSLATIONS: Record<Lang, Dict> = {
  en: {
    // Brand
    'brand.name': 'IELTS Speaking Coach',

    // Language toggle
    'lang.toggle.title': 'Switch language',
    'lang.en.short': 'EN',
    'lang.vi.short': 'VI',
    'lang.en.long': 'English',
    'lang.vi.long': 'Tiếng Việt',

    // Theme toggle
    'theme.toggle.toDark': 'Switch to dark mode',
    'theme.toggle.toLight': 'Switch to light mode',

    // Common
    'common.signIn': 'Sign in',
    'common.signUp': 'Sign up',
    'common.signOut': 'Sign out',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.user': 'User',
    'common.you': 'You',
    'common.agent': 'Agent',
    'common.start': 'Start',
    'common.replay': 'Replay',
    'common.dashboard': 'Dashboard',

    // Dashboard
    'dash.greeting': 'Hello, {name} 👋',
    'dash.subtitle': "Here's your learning progress and session history.",
    'dash.newSession': 'New Session',

    'dash.stats.totalSessions': 'Total sessions',
    'dash.stats.totalSessions.sub': 'all time',
    'dash.stats.avgScore': 'Average score',
    'dash.stats.avgScore.sub': 'across all topics',
    'dash.stats.practice': 'Practice time',
    'dash.stats.practice.sub': 'total',
    'dash.stats.streak': 'Current streak',
    'dash.stats.streak.value': '{n} days',
    'dash.stats.streak.sub': 'keep it up!',
    'dash.stats.minutes': '{n} min',

    'dash.chart.title': 'IELTS Band Score Trend',
    'dash.chart.subtitle': 'Your estimated IELTS band across all sessions',
    'dash.chart.avgLabel': 'Median Band',
    'dash.chart.band': 'Band',
    'dash.chart.pts': 'band',
    'dash.chart.tabLine': 'Trend',
    'dash.chart.tabRadar': 'Skills',
    'dash.chart.sessionCount': '{n} sessions recorded',
    'dash.chart.practiceBtn': 'Start new session →',
    'dash.chart.emptyTitle': 'No data yet',
    'dash.chart.emptyBody':
      'Complete a speaking session to see your IELTS band score trend over time.',
    'dash.chart.emptyBtn': 'Start speaking →',
    'dash.chart.radar.pronunciation': 'Pronunciation',
    'dash.chart.radar.fluency': 'Fluency',
    'dash.chart.radar.accuracy': 'Accuracy',
    'dash.chart.radar.label': 'Avg Band',
    'dash.chart.radar.note': 'Based on sub-scores from sessions with pronunciation assessment',

    'dash.topics.title': 'Choose a practice topic',
    'dash.topics.subtitle': 'Browse by category and pick what you want to practise today.',
    'dash.topics.scrollLeft': 'Scroll left',
    'dash.topics.scrollRight': 'Scroll right',

    'dash.logout.title': 'Sign out?',
    'dash.logout.body': 'Are you sure you want to sign out of your account?',
    'dash.logout.confirm': 'Sign out',

    'dash.error.back': 'Back to login',
    'dash.loading': 'Loading your workspace...',
    'dash.fallbackName': 'Learner',

    // Error boundary
    'error.title': 'Something went wrong',
    'error.body': 'The page failed to load. Please try again or reload.',
    'error.retry': 'Try again',
    'error.reload': 'Reload page',

    // Toasts
    'toast.signedOut': 'Signed out successfully.',
    'toast.resumingTopic': 'Resuming your last conversation on this topic.',
    'toast.welcomeBack': 'Welcome back, {name}!',
    'toast.loginFailed': 'Login failed',
    'toast.accountCreated': 'Account created!',
    'toast.registerFailed': 'Registration failed. Please try again.',
    'toast.loginRequired': 'Please sign in to access this page.',

    // Auth (loading states)
    'auth.signingIn': 'Signing in…',
    'auth.creatingAccount': 'Creating account…',

    // Shortcuts cheatsheet
    'shortcuts.title': 'Keyboard shortcuts',
    'shortcuts.subtitle': 'Speed up your practice with these keys',
    'shortcuts.hint': 'Press ? anywhere to open or close this panel',
    'shortcuts.section.global': 'Global',
    'shortcuts.section.voice': 'Voice session',
    'shortcuts.section.dashboard': 'Dashboard',
    'shortcuts.openCheatsheet': 'Open this cheatsheet',
    'shortcuts.closeModal': 'Close any modal',
    'shortcuts.toggleMic': 'Toggle microphone',
    'shortcuts.sendText': 'Send typed message',
    'shortcuts.muteAgent': 'Mute / unmute agent voice',
    'shortcuts.replayLast': 'Replay last agent reply',
    'shortcuts.newSession': 'Start new session',
    'shortcuts.toggleTheme': 'Toggle dark mode',

    // Badges / gamification
    'badges.title': 'Achievements',
    'badges.subtitle': 'Earn badges as you practise',
    'badges.locked': 'Locked',
    'badges.unlocked': 'Unlocked',
    'badges.progress': '{n} of {total} unlocked',
    'badges.firstSession.name': 'First Step',
    'badges.firstSession.desc': 'Complete your first session',
    'badges.threeDayStreak.name': 'On a Roll',
    'badges.threeDayStreak.desc': '3-day practice streak',
    'badges.sevenDayStreak.name': 'Week Warrior',
    'badges.sevenDayStreak.desc': '7-day practice streak',
    'badges.tenSessions.name': 'Dedicated',
    'badges.tenSessions.desc': 'Complete 10 sessions',
    'badges.band65.name': 'Solid 6.5',
    'badges.band65.desc': 'Reach Band 6.5',
    'badges.band70.name': 'Strong 7.0',
    'badges.band70.desc': 'Reach Band 7.0',
    'badges.hourPracticed.name': 'Hour Hero',
    'badges.hourPracticed.desc': 'Practise 60 minutes total',

    // Compare mode chart
    'dash.chart.compareToggle': 'Compare to last period',
    'dash.chart.thisPeriod': 'This period',
    'dash.chart.lastPeriod': 'Last period',
    'dash.chart.delta.up': '+{n} band vs last period',
    'dash.chart.delta.down': '{n} band vs last period',
    'dash.chart.delta.same': 'Same as last period',

    // Empty-state illustration
    'dash.empty.step1': 'Pick a topic',
    'dash.empty.step2': 'Talk with the AI',
    'dash.empty.step3': 'See your IELTS band',

    // Voice agent — history sidebar
    'va.history.title': 'Past sessions',
    'va.history.empty': 'No past sessions yet. Finish your first chat!',
    'va.history.open': 'Open history',
    'va.history.close': 'Close history',
    'va.history.viewSummary': 'View summary',
    'va.history.delete': 'Delete',
    'va.history.confirmDelete': 'Delete this session?',
    'va.history.deleted': 'Session deleted.',
    'va.history.minutes': '{n} min',
    'va.history.sentences': '{n} sentences',
    'va.history.count': '{n} session(s)',
    'va.history.loading': 'Loading conversation...',

    // Voice agent — conversation sidebar (left)
    'va.sidebar.newChat': 'New Chat',
    'va.sidebar.today': 'Today',
    'va.sidebar.yesterday': 'Yesterday',
    'va.sidebar.thisWeek': 'This Week',
    'va.sidebar.older': 'Older',
    'va.sidebar.empty': 'No conversations yet.',
    'va.sidebar.delete': 'Delete',
    'va.sidebar.confirmDelete': 'Delete this conversation?',
    'va.sidebar.deleted': 'Deleted.',
    'va.sidebar.close': 'Close sidebar',
    'va.sidebar.limitReached':
      'This topic has reached the 5-session limit. Delete an old session to start a new one.',
    'va.sidebar.limitBadge': '5/5',
    'va.sidebar.noTopicSelected': 'Select a topic first to see conversation history.',
    'va.sidebar.emptyTopic': 'No conversations for this topic yet.',
    'va.sidebar.topicCount': '{count}/5 sessions',
    'va.sidebar.uncategorized': 'No topic assigned',

    // Onboarding tip (first time)
    'onboarding.title': 'Welcome to Voice Trainer 👋',
    'onboarding.body':
      'Pick any topic below to start a guided English speaking session. The AI listens, scores your pronunciation, and gives instant feedback. Press ? anytime to see shortcuts.',
    'onboarding.cta': 'Got it, let\u2019s go',

    // Topic categories
    'category.IELTS Speaking.name': 'IELTS Speaking',
    'category.IELTS Speaking.desc': 'Practise official IELTS-style speaking parts.',
    'category.ielts.name': 'IELTS Speaking',
    'category.ielts.desc': 'Practise official IELTS-style speaking parts.',
    'category.Business & Career.name': 'Business & Career',
    'category.Business & Career.desc': 'Workplace English and professional speaking.',
    'category.business.name': 'Business & Career',
    'category.business.desc': 'Workplace English and professional speaking.',
    'category.Daily Life.name': 'Daily Life',
    'category.Daily Life.desc': 'Everyday situations you face all the time.',
    'category.daily.name': 'Daily Life',
    'category.daily.desc': 'Everyday situations you face all the time.',
    'category.Travel & Culture.name': 'Travel & Culture',
    'category.Travel & Culture.desc': 'From booking flights to cross-cultural chats.',

    // Topic cards
    'topic.IELTS Part 1.title': 'IELTS Part 1 — Intro',
    'topic.IELTS Part 1.desc': 'Personal questions about you and familiar topics.',
    'topic.IELTS Part 2.title': 'IELTS Part 2 — Long turn',
    'topic.IELTS Part 2.desc': 'Speak for 1-2 minutes from a cue card.',
    'topic.Academic Discussion.title': 'Academic Discussion',
    'topic.Academic Discussion.desc': 'Part 3 style — opinions, comparisons, abstract topics.',
    'topic.Describe a person.title': 'Describe a Person',
    'topic.Describe a person.desc': 'Vocabulary for character, appearance, relationships.',
    'topic.Describe a place.title': 'Describe a Place',
    'topic.Describe a place.desc': 'City, country, landmark, favourite location.',
    'topic.Job Interview.title': 'Job Interview',
    'topic.Job Interview.desc': 'Common questions and structured answers.',
    'topic.Office Meeting.title': 'Office Meeting',
    'topic.Office Meeting.desc': 'Discuss projects, share opinions, agree/disagree.',
    'topic.Presentations.title': 'Presentations',
    'topic.Presentations.desc': 'Open, structure, and close a short talk.',
    'topic.Negotiation.title': 'Negotiation',
    'topic.Negotiation.desc': 'Bargain politely, propose terms, reach agreement.',
    'topic.Email & Phone.title': 'Phone & Email Talk',
    'topic.Email & Phone.desc': 'Professional phone calls and follow-ups.',
    'topic.Travel English.title': 'Travel English',
    'topic.Travel English.desc': 'Booking, directions, airports, holiday stories.',
    'topic.Business Meeting.title': 'Business Meeting',
    'topic.Business Meeting.desc': 'Meetings, negotiations, presentations.',
    'topic.Daily Conversation.title': 'Daily Conversation',
    'topic.Daily Conversation.desc': 'Hobbies, family, weekend plans, weather.',
    'topic.Shopping.title': 'Shopping',
    'topic.Shopping.desc': 'Ask prices, compare items, return products.',
    'topic.Healthcare.title': 'Healthcare',
    'topic.Healthcare.desc': 'Doctor visits, symptoms, pharmacy talk.',
    'topic.Family & Friends.title': 'Family & Friends',
    'topic.Family & Friends.desc': 'Relationships, gatherings, personal stories.',
    'topic.Hobbies.title': 'Hobbies & Interests',
    'topic.Hobbies.desc': 'Talk about passions and free time activities.',
    'topic.Travel & Tourism.title': 'Travel & Tourism',
    'topic.Travel & Tourism.desc': 'Booking, directions, holiday stories.',
    'topic.Food & Restaurant.title': 'Food & Restaurant',
    'topic.Food & Restaurant.desc': 'Order, describe taste, ask about dishes.',
    'topic.Hotel & Booking.title': 'Hotel & Booking',
    'topic.Hotel & Booking.desc': 'Check-in, request services, handle problems.',
    'topic.Culture & Customs.title': 'Culture & Customs',
    'topic.Culture & Customs.desc': 'Compare traditions and cross-cultural topics.',
    'topic.Airport English.title': 'Airport English',
    'topic.Airport English.desc': 'Check-in, security, customs vocabulary.',

    // Levels
    'level.All levels': 'All levels',
    'level.Beginner': 'Beginner',
    'level.Beginner+': 'Beginner+',
    'level.Intermediate': 'Intermediate',
    'level.Intermediate+': 'Intermediate+',
    'level.Advanced': 'Advanced',

    // VoiceAgent — header
    'va.theme.light': 'Switch to light mode',
    'va.theme.dark': 'Switch to dark mode',

    // VoiceAgent — description bar
    'va.descbar.label': 'Description',

    // VoiceAgent — connect button
    'va.connect.connect': 'Connect',
    'va.connect.connecting': 'Connecting...',
    'va.connect.disconnect': 'Disconnect',

    // VoiceAgent — left panel
    'va.left.audioSettings': 'Audio Settings',
    'va.left.microphone': 'Microphone',
    'va.left.aiFeedback': 'AI Feedback',
    'va.left.showLatest': 'Show latest',
    'va.left.latest': 'Latest',
    'va.left.selectedSentence': 'Selected sentence',
    'va.left.latestSentence': 'Latest sentence',
    'va.left.scoreBreakdown': 'Score breakdown',
    'va.left.errors': 'Errors',
    'va.left.errorsCount': 'Errors ({n})',
    'va.left.noIssues': 'Great job! No issues detected in this sentence.',
    'va.left.feedbackEmptyConnected':
      'Send a message to see feedback for your latest sentence here.',
    'va.left.assessing': 'Assessing...',
    'va.left.feedbackEmptyDisconnected': 'Connect to see real-time English corrections',

    // VoiceAgent — score labels
    'va.score.overall': 'Overall',
    'va.score.pronunciation': 'Pronunciation',
    'va.score.pronShort': 'Pronunc.',
    'va.score.fluency': 'Fluency',
    'va.score.accuracy': 'Accuracy',
    'va.score.completeness': 'Completeness',

    // VoiceAgent — mistake types
    'va.mistake.Pronunciation': 'Pronunciation',
    'va.mistake.Grammar': 'Grammar',
    'va.mistake.Word choice': 'Word choice',
    'va.mistake.Fluency': 'Fluency',

    // VoiceAgent — conversation panel
    'va.conv.title': 'Conversation',
    'va.conv.agentSpeaking': 'Agent speaking',
    'va.conv.listening': 'Listening',

    // VoiceAgent — empty / connecting states
    'va.empty.clickConnectPrefix': 'Click',
    'va.empty.clickConnectSuffix': 'to start a session',
    'va.empty.transcriptHere': 'Conversation transcript will appear here',
    'va.connecting.note': 'Establishing connection...',

    // VoiceAgent — input bar
    'va.input.connectHint': 'Connect to start chatting',
    'va.input.listening': 'Listening to your voice...',
    'va.input.agentTyping': 'Agent is typing...',
    'va.input.placeholder': 'Type a message...',
    'va.input.statusHint': '{n} messages',

    // VoiceAgent — settings overlay
    'va.settings.title': 'Practice topic',
    'va.settings.subtitle': 'Choose a topic so the AI can guide you in the right direction',

    // VoiceAgent — session summary modal
    'va.summary.title': 'Session summary',
    'va.summary.meta': '{sentences} sentences • {errors} total errors',
    'va.summary.viewDashboard': 'View on Dashboard',
    'va.summary.newSession': 'New session',
    'va.summary.topErrors': 'Top error types',
    'va.summary.tips': 'Practice tips',

    // VoiceAgent — alerts
    'va.alert.noBrowserSupport':
      'This browser does not support speech recognition. Please use Chrome or Edge on a desktop.',
    'va.alert.noMicAPI':
      'This browser does not support microphone access (requires HTTPS and a recent Chrome/Edge).',
    'va.alert.micBlockedPreview':
      "The browser is blocking the microphone. If you're viewing the app in a preview frame, open it in a new tab and allow the microphone.",
    'va.alert.recogBlockedPreview':
      "The browser is blocking the microphone or speech recognition service. If you're inside a preview frame, open the app in a new tab and allow the microphone.",
    'va.alert.micBlocked':
      'Microphone permission was blocked. Open browser settings → Site permissions → allow microphone, then reload the page.',
    'va.alert.micNotFound':
      'No microphone device found. Plug in a microphone or pick another device.',
    'va.alert.micBusy':
      'Your microphone is being used by another app. Close any apps using the mic and try again.',
    'va.alert.micGeneric': 'Could not access the microphone: {detail}',
    'va.alert.unknownError': 'unknown error',
    'va.alert.noSignal': 'No signal from the microphone. Please check your recording device.',
    'va.alert.recogGivingUp':
      'Speech recognition keeps failing. Try opening the app in a new tab (Chrome/Edge) and granting microphone permission.',
    'va.alert.connectFailed':
      'Could not start the session. Please check your microphone and try again.',
    'va.alert.recognitionFailed': 'Speech recognition could not start: {detail}',

    // Message bubble
    'bubble.replay.title': 'Replay',
    'bubble.score.title': 'Pronunciation score',
    'bubble.deselect': 'Click to deselect',
    'bubble.select': 'Click to view feedback in the AI Feedback panel',
  },

  vi: {
    // Brand
    'brand.name': 'IELTS Speaking Coach',

    // Language toggle
    'lang.toggle.title': 'Đổi ngôn ngữ',
    'lang.en.short': 'EN',
    'lang.vi.short': 'VI',
    'lang.en.long': 'English',
    'lang.vi.long': 'Tiếng Việt',

    // Theme toggle
    'theme.toggle.toDark': 'Chuyển sang giao diện tối',
    'theme.toggle.toLight': 'Chuyển sang giao diện sáng',

    // Common
    'common.signIn': 'Đăng nhập',
    'common.signUp': 'Đăng ký',
    'common.signOut': 'Đăng xuất',
    'common.cancel': 'Hủy',
    'common.close': 'Đóng',
    'common.user': 'Người dùng',
    'common.you': 'Bạn',
    'common.agent': 'Trợ lý',
    'common.start': 'Bắt đầu',
    'common.replay': 'Phát lại',
    'common.dashboard': 'Trang chính',

    // Dashboard
    'dash.greeting': 'Xin chào, {name} 👋',
    'dash.subtitle': 'Tiến độ học và lịch sử các phiên luyện tập của bạn.',
    'dash.newSession': 'Phiên mới',

    'dash.stats.totalSessions': 'Tổng số phiên',
    'dash.stats.totalSessions.sub': 'tất cả thời gian',
    'dash.stats.avgScore': 'Điểm trung bình',
    'dash.stats.avgScore.sub': 'trên tất cả chủ đề',
    'dash.stats.practice': 'Thời gian luyện tập',
    'dash.stats.practice.sub': 'tổng cộng',
    'dash.stats.streak': 'Chuỗi hiện tại',
    'dash.stats.streak.value': '{n} ngày',
    'dash.stats.streak.sub': 'cố lên!',
    'dash.stats.minutes': '{n} phút',

    'dash.chart.title': 'Xu hướng Band IELTS',
    'dash.chart.subtitle': 'Band IELTS ước tính qua các phiên luyện tập',
    'dash.chart.avgLabel': 'Band giữa',
    'dash.chart.band': 'Band',
    'dash.chart.pts': 'band',
    'dash.chart.tabLine': 'Xu hướng',
    'dash.chart.tabRadar': 'Kỹ năng',
    'dash.chart.sessionCount': '{n} phiên đã ghi nhận',
    'dash.chart.practiceBtn': 'Bắt đầu phiên mới →',
    'dash.chart.emptyTitle': 'Chưa có dữ liệu',
    'dash.chart.emptyBody':
      'Hoàn thành một phiên nói để xem xu hướng band IELTS của bạn theo thời gian.',
    'dash.chart.emptyBtn': 'Bắt đầu nói →',
    'dash.chart.radar.pronunciation': 'Phát âm',
    'dash.chart.radar.fluency': 'Lưu loát',
    'dash.chart.radar.accuracy': 'Chính xác',
    'dash.chart.radar.label': 'Band TB',
    'dash.chart.radar.note': 'Dựa trên điểm thành phần từ các phiên có đánh giá phát âm',

    'dash.topics.title': 'Chọn chủ đề luyện tập',
    'dash.topics.subtitle': 'Duyệt theo danh mục và chọn chủ đề bạn muốn luyện hôm nay.',
    'dash.topics.scrollLeft': 'Cuộn sang trái',
    'dash.topics.scrollRight': 'Cuộn sang phải',

    'dash.logout.title': 'Đăng xuất?',
    'dash.logout.body': 'Bạn có chắc muốn đăng xuất khỏi tài khoản không?',
    'dash.logout.confirm': 'Đăng xuất',

    'dash.error.back': 'Quay lại đăng nhập',
    'dash.loading': 'Đang tải không gian làm việc...',
    'dash.fallbackName': 'Học viên',

    // Error boundary
    'error.title': 'Đã có lỗi xảy ra',
    'error.body': 'Trang không tải được. Vui lòng thử lại hoặc tải lại trang.',
    'error.retry': 'Thử lại',
    'error.reload': 'Tải lại trang',

    // Toasts
    'toast.signedOut': 'Đã đăng xuất.',
    'toast.resumingTopic': 'Đang tiếp tục cuộc trò chuyện gần nhất của chủ đề này.',
    'toast.welcomeBack': 'Chào bạn trở lại, {name}!',
    'toast.loginFailed': 'Đăng nhập thất bại',
    'toast.accountCreated': 'Đã tạo tài khoản!',
    'toast.registerFailed': 'Đăng ký thất bại. Vui lòng thử lại.',
    'toast.loginRequired': 'Vui lòng đăng nhập để vào trang này.',

    // Auth (loading states)
    'auth.signingIn': 'Đang đăng nhập…',
    'auth.creatingAccount': 'Đang tạo tài khoản…',

    // Shortcuts cheatsheet
    'shortcuts.title': 'Phím tắt',
    'shortcuts.subtitle': 'Luyện tập nhanh hơn với các phím này',
    'shortcuts.hint': 'Bấm ? bất cứ đâu để mở/đóng bảng này',
    'shortcuts.section.global': 'Toàn cục',
    'shortcuts.section.voice': 'Phiên luyện nói',
    'shortcuts.section.dashboard': 'Trang chính',
    'shortcuts.openCheatsheet': 'Mở bảng phím tắt này',
    'shortcuts.closeModal': 'Đóng cửa sổ',
    'shortcuts.toggleMic': 'Bật/tắt micro',
    'shortcuts.sendText': 'Gửi tin nhắn đã gõ',
    'shortcuts.muteAgent': 'Tắt/bật tiếng trợ lý',
    'shortcuts.replayLast': 'Nghe lại câu cuối của trợ lý',
    'shortcuts.newSession': 'Bắt đầu phiên mới',
    'shortcuts.toggleTheme': 'Đổi giao diện sáng/tối',

    // Badges / gamification
    'badges.title': 'Thành tích',
    'badges.subtitle': 'Nhận huy hiệu khi bạn luyện tập',
    'badges.locked': 'Chưa mở',
    'badges.unlocked': 'Đã mở',
    'badges.progress': 'Đã mở {n}/{total}',
    'badges.firstSession.name': 'Bước đầu tiên',
    'badges.firstSession.desc': 'Hoàn thành phiên đầu tiên',
    'badges.threeDayStreak.name': 'Đà tốt',
    'badges.threeDayStreak.desc': 'Chuỗi 3 ngày liên tiếp',
    'badges.sevenDayStreak.name': 'Chiến binh tuần',
    'badges.sevenDayStreak.desc': 'Chuỗi 7 ngày liên tiếp',
    'badges.tenSessions.name': 'Chăm chỉ',
    'badges.tenSessions.desc': 'Hoàn thành 10 phiên',
    'badges.band65.name': 'Vững Band 6.5',
    'badges.band65.desc': 'Đạt Band 6.5',
    'badges.band70.name': 'Mạnh Band 7.0',
    'badges.band70.desc': 'Đạt Band 7.0',
    'badges.hourPracticed.name': 'Anh hùng 1 giờ',
    'badges.hourPracticed.desc': 'Luyện tập tổng 60 phút',

    // Compare mode chart
    'dash.chart.compareToggle': 'So với kỳ trước',
    'dash.chart.thisPeriod': 'Kỳ này',
    'dash.chart.lastPeriod': 'Kỳ trước',
    'dash.chart.delta.up': '+{n} band so với kỳ trước',
    'dash.chart.delta.down': '{n} band so với kỳ trước',
    'dash.chart.delta.same': 'Bằng kỳ trước',

    // Empty-state illustration
    'dash.empty.step1': 'Chọn chủ đề',
    'dash.empty.step2': 'Nói với AI',
    'dash.empty.step3': 'Xem Band IELTS',

    // Voice agent — history sidebar
    'va.history.title': 'Phiên đã qua',
    'va.history.empty': 'Chưa có phiên nào. Hoàn thành phiên đầu tiên đi!',
    'va.history.open': 'Mở lịch sử',
    'va.history.close': 'Đóng lịch sử',
    'va.history.viewSummary': 'Xem tóm tắt',
    'va.history.delete': 'Xóa',
    'va.history.confirmDelete': 'Xóa phiên này?',
    'va.history.deleted': 'Đã xóa phiên.',
    'va.history.minutes': '{n} phút',
    'va.history.sentences': '{n} câu',
    'va.history.count': '{n} phiên',
    'va.history.loading': 'Đang tải hội thoại...',

    // Voice agent — conversation sidebar (left)
    'va.sidebar.newChat': 'Chat mới',
    'va.sidebar.today': 'Hôm nay',
    'va.sidebar.yesterday': 'Hôm qua',
    'va.sidebar.thisWeek': '7 ngày qua',
    'va.sidebar.older': 'Cũ hơn',
    'va.sidebar.empty': 'Chưa có cuộc hội thoại nào.',
    'va.sidebar.delete': 'Xóa',
    'va.sidebar.confirmDelete': 'Xóa cuộc hội thoại này?',
    'va.sidebar.deleted': 'Đã xóa.',
    'va.sidebar.close': 'Đóng thanh bên',
    'va.sidebar.limitReached': 'Topic này đã đạt giới hạn 5 phiên. Xóa phiên cũ để tạo phiên mới.',
    'va.sidebar.limitBadge': '5/5',
    'va.sidebar.noTopicSelected': 'Chọn một topic trước để xem lịch sử hội thoại.',
    'va.sidebar.emptyTopic': 'Chưa có hội thoại nào cho topic này.',
    'va.sidebar.topicCount': '{count}/5 phiên',
    'va.sidebar.uncategorized': 'Chưa có topic',

    // Onboarding tip (first time)
    'onboarding.title': 'Chào mừng đến Voice Trainer 👋',
    'onboarding.body':
      'Chọn một chủ đề bên dưới để bắt đầu phiên luyện nói tiếng Anh có hướng dẫn. AI sẽ nghe, chấm điểm phát âm và phản hồi tức thời. Bấm ? bất cứ lúc nào để xem các phím tắt.',
    'onboarding.cta': 'Đã hiểu, bắt đầu thôi',

    // Topic categories
    'category.IELTS Speaking.name': 'IELTS Speaking',
    'category.IELTS Speaking.desc': 'Luyện các dạng nói chính thức theo phong cách IELTS.',
    'category.ielts.name': 'IELTS Speaking',
    'category.ielts.desc': 'Luyện các dạng nói chính thức theo phong cách IELTS.',
    'category.Business & Career.name': 'Công việc & Sự nghiệp',
    'category.Business & Career.desc': 'Tiếng Anh nơi làm việc và giao tiếp chuyên nghiệp.',
    'category.business.name': 'Công việc & Sự nghiệp',
    'category.business.desc': 'Tiếng Anh nơi làm việc và giao tiếp chuyên nghiệp.',
    'category.Daily Life.name': 'Đời sống hàng ngày',
    'category.Daily Life.desc': 'Các tình huống quen thuộc bạn gặp mỗi ngày.',
    'category.daily.name': 'Đời sống hàng ngày',
    'category.daily.desc': 'Các tình huống quen thuộc bạn gặp mỗi ngày.',
    'category.Travel & Culture.name': 'Du lịch & Văn hóa',
    'category.Travel & Culture.desc': 'Từ đặt vé máy bay đến trò chuyện liên văn hóa.',

    // Topic cards
    'topic.IELTS Part 1.title': 'IELTS Part 1 — Giới thiệu',
    'topic.IELTS Part 1.desc': 'Câu hỏi cá nhân về bản thân và các chủ đề quen thuộc.',
    'topic.IELTS Part 2.title': 'IELTS Part 2 — Nói dài',
    'topic.IELTS Part 2.desc': 'Nói 1-2 phút từ một cue card.',
    'topic.Academic Discussion.title': 'Thảo luận học thuật',
    'topic.Academic Discussion.desc': 'Phong cách Part 3 — quan điểm, so sánh, chủ đề trừu tượng.',
    'topic.Describe a person.title': 'Tả người',
    'topic.Describe a person.desc': 'Từ vựng về tính cách, ngoại hình, mối quan hệ.',
    'topic.Describe a place.title': 'Tả nơi chốn',
    'topic.Describe a place.desc': 'Thành phố, đất nước, địa danh, nơi yêu thích.',
    'topic.Job Interview.title': 'Phỏng vấn xin việc',
    'topic.Job Interview.desc': 'Câu hỏi thường gặp và cách trả lời có cấu trúc.',
    'topic.Office Meeting.title': 'Họp công ty',
    'topic.Office Meeting.desc': 'Bàn dự án, chia sẻ ý kiến, đồng ý/phản đối.',
    'topic.Presentations.title': 'Thuyết trình',
    'topic.Presentations.desc': 'Mở đầu, sắp xếp và kết thúc một bài nói ngắn.',
    'topic.Negotiation.title': 'Đàm phán',
    'topic.Negotiation.desc': 'Mặc cả lịch sự, đề xuất điều khoản, đạt thỏa thuận.',
    'topic.Email & Phone.title': 'Điện thoại & Email',
    'topic.Email & Phone.desc': 'Cuộc gọi và phản hồi chuyên nghiệp.',
    'topic.Travel English.title': 'Tiếng Anh Du lịch',
    'topic.Travel English.desc': 'Đặt chỗ, hỏi đường, sân bay, kể chuyện đi chơi.',
    'topic.Business Meeting.title': 'Họp kinh doanh',
    'topic.Business Meeting.desc': 'Cuộc họp, đàm phán, thuyết trình.',
    'topic.Daily Conversation.title': 'Giao tiếp hàng ngày',
    'topic.Daily Conversation.desc': 'Sở thích, gia đình, kế hoạch cuối tuần, thời tiết.',
    'topic.Shopping.title': 'Mua sắm',
    'topic.Shopping.desc': 'Hỏi giá, so sánh sản phẩm, đổi trả hàng.',
    'topic.Healthcare.title': 'Y tế',
    'topic.Healthcare.desc': 'Khám bệnh, triệu chứng, giao tiếp ở hiệu thuốc.',
    'topic.Family & Friends.title': 'Gia đình & Bạn bè',
    'topic.Family & Friends.desc': 'Mối quan hệ, tụ họp, câu chuyện cá nhân.',
    'topic.Hobbies.title': 'Sở thích & Đam mê',
    'topic.Hobbies.desc': 'Nói về đam mê và hoạt động lúc rảnh rỗi.',
    'topic.Travel & Tourism.title': 'Du lịch',
    'topic.Travel & Tourism.desc': 'Đặt chỗ, hỏi đường, kể chuyện đi chơi.',
    'topic.Food & Restaurant.title': 'Ẩm thực & Nhà hàng',
    'topic.Food & Restaurant.desc': 'Gọi món, tả vị, hỏi về món ăn.',
    'topic.Hotel & Booking.title': 'Khách sạn & Đặt phòng',
    'topic.Hotel & Booking.desc': 'Nhận phòng, yêu cầu dịch vụ, xử lý sự cố.',
    'topic.Culture & Customs.title': 'Văn hóa & Phong tục',
    'topic.Culture & Customs.desc': 'So sánh truyền thống và chủ đề liên văn hóa.',
    'topic.Airport English.title': 'Tiếng Anh sân bay',
    'topic.Airport English.desc': 'Từ vựng check-in, an ninh, hải quan.',

    // Levels
    'level.All levels': 'Mọi trình độ',
    'level.Beginner': 'Mới bắt đầu',
    'level.Beginner+': 'Mới bắt đầu trở lên',
    'level.Intermediate': 'Trung cấp',
    'level.Intermediate+': 'Trung cấp trở lên',
    'level.Advanced': 'Nâng cao',

    // VoiceAgent — header
    'va.theme.light': 'Chuyển sang nền sáng',
    'va.theme.dark': 'Chuyển sang nền tối',

    // VoiceAgent — description bar
    'va.descbar.label': 'Chủ đề',

    // VoiceAgent — connect button
    'va.connect.connect': 'Kết nối',
    'va.connect.connecting': 'Đang kết nối...',
    'va.connect.disconnect': 'Ngắt kết nối',

    // VoiceAgent — left panel
    'va.left.audioSettings': 'Cài đặt âm thanh',
    'va.left.microphone': 'Micro',
    'va.left.aiFeedback': 'Phản hồi AI',
    'va.left.showLatest': 'Xem mới nhất',
    'va.left.latest': 'Mới nhất',
    'va.left.selectedSentence': 'Câu đã chọn',
    'va.left.latestSentence': 'Câu mới nhất',
    'va.left.scoreBreakdown': 'Phân tích điểm',
    'va.left.errors': 'Lỗi',
    'va.left.errorsCount': 'Lỗi ({n})',
    'va.left.noIssues': 'Tuyệt vời! Không phát hiện lỗi nào trong câu này.',
    'va.left.feedbackEmptyConnected':
      'Gửi tin nhắn để xem phản hồi cho câu mới nhất của bạn ở đây.',
    'va.left.assessing': 'Đang chấm...',
    'va.left.feedbackEmptyDisconnected': 'Kết nối để xem chỉnh sửa tiếng Anh theo thời gian thực',

    // VoiceAgent — score labels
    'va.score.overall': 'Tổng quát',
    'va.score.pronunciation': 'Phát âm',
    'va.score.pronShort': 'Phát âm',
    'va.score.fluency': 'Trôi chảy',
    'va.score.accuracy': 'Chính xác',
    'va.score.completeness': 'Độ hoàn chỉnh',

    // VoiceAgent — mistake types
    'va.mistake.Pronunciation': 'Phát âm',
    'va.mistake.Grammar': 'Ngữ pháp',
    'va.mistake.Word choice': 'Chọn từ',
    'va.mistake.Fluency': 'Độ trôi chảy',

    // VoiceAgent — conversation panel
    'va.conv.title': 'Hội thoại',
    'va.conv.agentSpeaking': 'Trợ lý đang nói',
    'va.conv.listening': 'Đang nghe',

    // VoiceAgent — empty / connecting states
    'va.empty.clickConnectPrefix': 'Bấm',
    'va.empty.clickConnectSuffix': 'để bắt đầu phiên',
    'va.empty.transcriptHere': 'Lịch sử hội thoại sẽ hiện ở đây',
    'va.connecting.note': 'Đang thiết lập kết nối...',

    // VoiceAgent — input bar
    'va.input.connectHint': 'Kết nối để bắt đầu trò chuyện',
    'va.input.listening': 'Đang nghe giọng nói...',
    'va.input.agentTyping': 'Trợ lý đang gõ...',
    'va.input.placeholder': 'Nhập tin nhắn...',
    'va.input.statusHint': '{n} tin nhắn',

    // VoiceAgent — settings overlay
    'va.settings.title': 'Chủ đề luyện tập',
    'va.settings.subtitle': 'Chọn chủ đề để AI tập trung hướng dẫn đúng hướng',

    // VoiceAgent — session summary modal
    'va.summary.title': 'Tổng kết phiên',
    'va.summary.meta': '{sentences} câu • {errors} lỗi tổng',
    'va.summary.viewDashboard': 'Xem trang chính',
    'va.summary.newSession': 'Phiên mới',
    'va.summary.topErrors': 'Lỗi phổ biến',
    'va.summary.tips': 'Mẹo luyện tập',

    // VoiceAgent — alerts
    'va.alert.noBrowserSupport':
      'Trình duyệt không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome hoặc Edge trên máy tính.',
    'va.alert.noMicAPI':
      'Trình duyệt này không hỗ trợ truy cập micro (cần HTTPS và Chrome/Edge mới).',
    'va.alert.micBlockedPreview':
      'Trình duyệt chặn micro. Nếu bạn đang xem app trong khung xem trước, hãy mở app ở tab mới rồi cho phép micro.',
    'va.alert.recogBlockedPreview':
      'Trình duyệt chặn micro hoặc dịch vụ nhận dạng giọng nói. Nếu đang xem trong khung preview, hãy mở app ở tab mới và cho phép micro.',
    'va.alert.micBlocked':
      'Quyền truy cập micro đã bị chặn. Mở Cài đặt trình duyệt → Quyền trang web → cho phép micro, sau đó tải lại trang.',
    'va.alert.micNotFound': 'Không tìm thấy thiết bị micro. Hãy cắm micro hoặc chọn thiết bị khác.',
    'va.alert.micBusy':
      'Micro đang bị app khác chiếm dụng. Đóng các app dùng micro khác rồi thử lại.',
    'va.alert.micGeneric': 'Không thể truy cập micro: {detail}',
    'va.alert.unknownError': 'lỗi không xác định',
    'va.alert.noSignal': 'Không bắt được tín hiệu từ micro. Kiểm tra lại thiết bị thu âm.',
    'va.alert.recogGivingUp':
      'Nhận dạng giọng nói liên tục lỗi. Hãy thử mở app ở tab mới (Chrome/Edge) và cấp quyền micro.',
    'va.alert.connectFailed': 'Không thể bắt đầu phiên. Hãy kiểm tra micro và thử lại.',
    'va.alert.recognitionFailed': 'Không khởi động được nhận dạng giọng nói: {detail}',

    // Message bubble
    'bubble.replay.title': 'Phát lại',
    'bubble.score.title': 'Điểm phát âm',
    'bubble.deselect': 'Bấm để bỏ chọn',
    'bubble.select': 'Bấm để xem phản hồi trong bảng Phản hồi AI',
  },
};
