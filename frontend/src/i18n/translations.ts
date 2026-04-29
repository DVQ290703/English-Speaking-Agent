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
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
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
    'common.delete': 'Delete',
    'common.confirm': 'Confirm',
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

    'dash.storage.full': '⚠ Storage almost full',
    'dash.storage.usage': 'Storage usage',
    'dash.storage.fullNote':
      'New sessions may start dropping audio or older history. Clean up to free space.',
    'dash.storage.cleanup': 'Clean up old sessions',
    'dash.storage.confirmCleanup': 'Confirm: remove oldest {n}?',
    'dash.storage.sessionsCount': '{n}/{max} sessions',

    'dash.topics.title': 'Choose a practice topic',
    'dash.topics.subtitle': 'Browse by category and pick what you want to practise today.',
    'dash.topics.scrollLeft': 'Scroll left',
    'dash.topics.scrollRight': 'Scroll right',

    'dash.history.title': 'Session History',
    'dash.history.count': '{n} sessions',
    'dash.history.searchPlaceholder': 'Search by topic, date, or score...',
    'dash.history.clearSearch': 'Clear search',
    'dash.history.empty': 'No sessions yet for this topic.',
    'dash.history.cta': 'Ready to practise? Start a new session.',
    'dash.history.startSpeaking': 'Start speaking →',
    'dash.history.tabAll': 'All',

    'dash.session.justSaved': 'Just saved',
    'dash.session.viewTranscript': 'View transcript →',
    'dash.session.turns': '{n} turns',
    'dash.session.fixes': '{n} fixes',
    'dash.session.deleteConfirm': 'Delete this practice session? This cannot be undone.',
    'dash.session.deleteAria': 'Delete session',

    'dash.logout.title': 'Sign out?',
    'dash.logout.body': 'Are you sure you want to sign out of your account?',
    'dash.logout.confirm': 'Sign out',

    'dash.error.back': 'Back to login',
    'dash.loading': 'Loading your workspace...',
    'dash.fallbackName': 'Learner',

    // Topic categories
    'category.IELTS Speaking.name': 'IELTS Speaking',
    'category.IELTS Speaking.desc': 'Practise official IELTS-style speaking parts.',
    'category.Business & Career.name': 'Business & Career',
    'category.Business & Career.desc': 'Workplace English and professional speaking.',
    'category.Daily Life.name': 'Daily Life',
    'category.Daily Life.desc': 'Everyday situations you face all the time.',
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
    'va.input.placeholder': 'Type a message... (Enter to send)',
    'va.input.statusHint': '{n} messages • Enter to send, Shift+Enter for newline',

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
    'common.delete': 'Xóa',
    'common.confirm': 'Xác nhận',
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

    'dash.storage.full': '⚠ Bộ nhớ gần đầy',
    'dash.storage.usage': 'Mức sử dụng bộ nhớ',
    'dash.storage.fullNote':
      'Phiên mới có thể bị mất audio hoặc lịch sử cũ. Hãy dọn dẹp để giải phóng dung lượng.',
    'dash.storage.cleanup': 'Dọn dẹp phiên cũ',
    'dash.storage.confirmCleanup': 'Xác nhận: xóa {n} phiên cũ nhất?',
    'dash.storage.sessionsCount': '{n}/{max} phiên',

    'dash.topics.title': 'Chọn chủ đề luyện tập',
    'dash.topics.subtitle': 'Duyệt theo danh mục và chọn chủ đề bạn muốn luyện hôm nay.',
    'dash.topics.scrollLeft': 'Cuộn sang trái',
    'dash.topics.scrollRight': 'Cuộn sang phải',

    'dash.history.title': 'Lịch sử phiên',
    'dash.history.count': '{n} phiên',
    'dash.history.searchPlaceholder': 'Tìm theo chủ đề, ngày, hoặc điểm...',
    'dash.history.clearSearch': 'Xóa tìm kiếm',
    'dash.history.empty': 'Chưa có phiên nào cho chủ đề này.',
    'dash.history.cta': 'Sẵn sàng luyện tập? Bắt đầu một phiên mới.',
    'dash.history.startSpeaking': 'Bắt đầu nói →',
    'dash.history.tabAll': 'Tất cả',

    'dash.session.justSaved': 'Vừa lưu',
    'dash.session.viewTranscript': 'Xem hội thoại →',
    'dash.session.turns': '{n} lượt',
    'dash.session.fixes': '{n} sửa',
    'dash.session.deleteConfirm': 'Xóa phiên luyện tập này? Hành động này không thể hoàn tác.',
    'dash.session.deleteAria': 'Xóa phiên',

    'dash.logout.title': 'Đăng xuất?',
    'dash.logout.body': 'Bạn có chắc muốn đăng xuất khỏi tài khoản không?',
    'dash.logout.confirm': 'Đăng xuất',

    'dash.error.back': 'Quay lại đăng nhập',
    'dash.loading': 'Đang tải không gian làm việc...',
    'dash.fallbackName': 'Học viên',

    // Topic categories
    'category.IELTS Speaking.name': 'IELTS Speaking',
    'category.IELTS Speaking.desc': 'Luyện các dạng nói chính thức theo phong cách IELTS.',
    'category.Business & Career.name': 'Công việc & Sự nghiệp',
    'category.Business & Career.desc': 'Tiếng Anh nơi làm việc và giao tiếp chuyên nghiệp.',
    'category.Daily Life.name': 'Đời sống hàng ngày',
    'category.Daily Life.desc': 'Các tình huống quen thuộc bạn gặp mỗi ngày.',
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
    'va.input.placeholder': 'Nhập tin nhắn... (Enter để gửi)',
    'va.input.statusHint': '{n} tin nhắn • Enter để gửi, Shift+Enter để xuống dòng',

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
