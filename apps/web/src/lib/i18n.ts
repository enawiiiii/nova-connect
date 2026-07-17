import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { safeStorage } from './platform';

const resources = {
  en: { translation: {
    nav: { chats: 'Chats', friends: 'Friends', calls: 'Calls', profile: 'Profile', settings: 'Settings' },
    common: { search: 'Search', online: 'Online', offline: 'Offline', cancel: 'Cancel', save: 'Save changes', loading: 'Loading your orbit…' },
    landing: { badge: 'Private by design · Made for your circle', titleA: 'Stay close.', titleB: 'Across every orbit.', body: 'One beautiful, private place for the people who matter. Message in real time, call in crystal clarity, and keep your circle close.', primary: 'Enter your orbit', secondary: 'Explore the experience', trusted: 'Private conversations. Human connections.', messages: 'Messages delivered', calls: 'Call quality', friends: 'Your circle' },
    auth: { welcome: 'Welcome back', join: 'Join your orbit', loginBody: 'Your people are already here.', registerBody: 'Create a private space for your closest people.', username: 'Username', email: 'Email address', password: 'Password', login: 'Sign in', register: 'Create account', noAccount: 'New to NOVA?', hasAccount: 'Already have an account?', create: 'Create one', signIn: 'Sign in', google: 'Continue with Google', divider: 'or continue with email' },
    chats: { title: 'Messages', subtitle: 'Your private conversations', search: 'Search conversations', newChat: 'New message', placeholder: 'Write a message…', typing: 'typing…', empty: 'Select a conversation to begin', emptyBody: 'Your closest conversations live here—quiet, private, and always within reach.' },
    friends: { title: 'Your circle', subtitle: 'The people in your orbit', add: 'Add friends', requests: 'Requests', search: 'Find someone by username', accept: 'Accept', decline: 'Decline', message: 'Message', pending: 'Request sent', remove: 'Remove' },
    calls: { title: 'Calls', subtitle: 'Moments that feel closer', startRoom: 'Start group room', history: 'Recent calls', voice: 'Voice', video: 'Video', missed: 'Missed', minutes: '{{count}} min', ready: 'Ready when you are', roomBody: 'Start a private room for up to 8 friends.', startVideo: 'Start video room' },
    profile: { title: 'Your profile', subtitle: 'How your circle sees you', bio: 'Bio', status: 'Status', username: 'Username', preview: 'Profile preview' },
    settings: { title: 'Settings', subtitle: 'Make NOVA feel like yours', appearance: 'Appearance', dark: 'Deep space', light: 'Soft light', language: 'Language & direction', notifications: 'Notifications', notifBody: 'Messages, friend requests, and incoming calls', privacy: 'Privacy & security', privacyBody: 'Manage sessions and blocked accounts', install: 'Install NOVA Connect', installBody: 'Add the app to this device for a faster, focused experience', installAction: 'Install app', signout: 'Sign out' },
    call: { encrypted: 'Peer connection secured', inviting: 'Waiting for friends to join…', mute: 'Mute', camera: 'Camera', share: 'Share screen', leave: 'Leave call', participants: '{{count}} / 8 participants' },
  } },
  ar: { translation: {
    nav: { chats: 'المحادثات', friends: 'الأصدقاء', calls: 'المكالمات', profile: 'الملف الشخصي', settings: 'الإعدادات' },
    common: { search: 'بحث', online: 'متصل', offline: 'غير متصل', cancel: 'إلغاء', save: 'حفظ التغييرات', loading: 'جارٍ تحميل مدارك…' },
    landing: { badge: 'خصوصية من البداية · صُمم لدائرتك', titleA: 'ابقَ قريباً.', titleB: 'مهما ابتعدت المدارات.', body: 'مكان واحد جميل وخاص للأشخاص المهمين. دردشة فورية، مكالمات واضحة، ودائرتك دائماً قريبة.', primary: 'ادخل إلى مدارك', secondary: 'استكشف التجربة', trusted: 'محادثات خاصة. روابط إنسانية.', messages: 'رسالة تم تسليمها', calls: 'جودة المكالمات', friends: 'دائرتك' },
    auth: { welcome: 'مرحباً بعودتك', join: 'انضم إلى مدارك', loginBody: 'أصدقاؤك بانتظارك هنا.', registerBody: 'أنشئ مساحة خاصة لأقرب الناس إليك.', username: 'اسم المستخدم', email: 'البريد الإلكتروني', password: 'كلمة المرور', login: 'تسجيل الدخول', register: 'إنشاء حساب', noAccount: 'جديد في NOVA؟', hasAccount: 'لديك حساب بالفعل؟', create: 'أنشئ حساباً', signIn: 'سجّل الدخول', google: 'المتابعة عبر Google', divider: 'أو تابع بالبريد الإلكتروني' },
    chats: { title: 'الرسائل', subtitle: 'محادثاتك الخاصة', search: 'ابحث في المحادثات', newChat: 'رسالة جديدة', placeholder: 'اكتب رسالة…', typing: 'يكتب الآن…', empty: 'اختر محادثة للبدء', emptyBody: 'أقرب محادثاتك تعيش هنا — بهدوء وخصوصية، ودائماً في متناولك.' },
    friends: { title: 'دائرتك', subtitle: 'الأشخاص في مدارك', add: 'إضافة أصدقاء', requests: 'الطلبات', search: 'ابحث باسم المستخدم', accept: 'قبول', decline: 'رفض', message: 'مراسلة', pending: 'تم إرسال الطلب', remove: 'إزالة' },
    calls: { title: 'المكالمات', subtitle: 'لحظات تشعرك بالقرب', startRoom: 'بدء غرفة جماعية', history: 'المكالمات الأخيرة', voice: 'صوتية', video: 'فيديو', missed: 'فائتة', minutes: '{{count}} د', ready: 'جاهز عندما تكون جاهزاً', roomBody: 'ابدأ غرفة خاصة لما يصل إلى 8 أصدقاء.', startVideo: 'بدء غرفة فيديو' },
    profile: { title: 'ملفك الشخصي', subtitle: 'كيف يراك أصدقاؤك', bio: 'النبذة', status: 'الحالة', username: 'اسم المستخدم', preview: 'معاينة الملف' },
    settings: { title: 'الإعدادات', subtitle: 'اجعل NOVA كما تحب', appearance: 'المظهر', dark: 'فضاء عميق', light: 'ضوء هادئ', language: 'اللغة والاتجاه', notifications: 'الإشعارات', notifBody: 'الرسائل وطلبات الصداقة والمكالمات الواردة', privacy: 'الخصوصية والأمان', privacyBody: 'إدارة الجلسات والحسابات المحظورة', install: 'تثبيت NOVA Connect', installBody: 'أضف التطبيق إلى جهازك لتجربة أسرع وأكثر تركيزاً', installAction: 'تثبيت التطبيق', signout: 'تسجيل الخروج' },
    call: { encrypted: 'اتصال مباشر آمن', inviting: 'بانتظار انضمام الأصدقاء…', mute: 'كتم', camera: 'الكاميرا', share: 'مشاركة الشاشة', leave: 'إنهاء', participants: '{{count}} / 8 مشاركين' },
  } },
};

const savedLanguage = safeStorage.get('nova-language') ?? 'en';
void i18n.use(initReactI18next).init({ resources, lng: savedLanguage, fallbackLng: 'en', interpolation: { escapeValue: false } });
document.documentElement.lang = savedLanguage;
document.documentElement.dir = savedLanguage === 'ar' ? 'rtl' : 'ltr';

export function setLanguage(language: 'en' | 'ar') {
  safeStorage.set('nova-language', language);
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  return i18n.changeLanguage(language);
}

export default i18n;
