import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('NOVA interface error', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="compatibility-error">
        <span className="brand-orbit"><span>N</span><i /></span>
        <h1>تعذّر تشغيل الواجهة</h1>
        <p>حدّث الصفحة أو افتح الرابط باستخدام أحدث إصدار من Safari.</p>
        <button className="button button-primary" onClick={() => window.location.reload()}>إعادة تحميل الصفحة</button>
      </main>
    );
  }
}
