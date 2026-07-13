import React, { ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Home, Copy, Check } from 'lucide-react';
import { captureAppError } from '../lib/errorMonitoring';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorRef: string;
  copied: boolean;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorRef: '',
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorRef = captureAppError(error, {
      type: 'react_error_boundary',
      componentStack: errorInfo.componentStack || '',
    });
    this.setState({ errorRef });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorRef: '', copied: false });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorRef: '', copied: false });
    window.location.hash = '#/';
    window.location.reload();
  };

  private handleCopy = async () => {
    if (!this.state.errorRef) return;
    try {
      await navigator.clipboard.writeText(this.state.errorRef);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    } catch (err) {
      console.warn('Failed to copy error reference to clipboard:', err);
    }
  };

  public render() {
    if (this.state.hasError) {
      const displayRef = this.state.errorRef || 'ERR-PENDING';
      return (
        <div 
          className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-6 font-sans select-none" 
          dir="rtl" 
          id="app-error-boundary"
        >
          <div className="w-full max-w-lg bg-slate-800 border border-slate-700 p-8 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden">
            
            {/* Glow decoration */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-red-500/20 rounded-full blur-3xl pointer-events-none -z-10" />

            <div className="flex items-center gap-3 border-b border-slate-700 pb-4">
              <div className="bg-red-500/10 p-2.5 rounded-xl shrink-0">
                <ShieldAlert className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-100">حدث خطأ غير متوقع</h1>
                <p className="text-xs text-slate-400">LEDGRA l لِدجرا — نظام المحاسبة الذكي</p>
              </div>
            </div>

            <div className="space-y-4 text-sm leading-relaxed text-slate-300">
              <p>
                نعتذر عن هذا الخلل المؤقت. يرجى الاطمئنان أن <strong>البيانات المحفوظة لم تُحذف</strong> وهي آمنة تمامًا في الخادم السحابي.
              </p>

              <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">رقم تتبع الخطأ (المرجع):</span>
                  <button 
                    onClick={this.handleCopy}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer bg-slate-700/50 hover:bg-slate-700 px-3 py-1 rounded-lg transition-colors border-none"
                  >
                    {this.state.copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-green-400">تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ الرقم</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="text-center font-mono text-lg bg-slate-900/80 p-3 rounded-xl border border-slate-700 text-red-400 tracking-wider">
                  {displayRef}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 py-3 px-4 rounded-xl font-medium transition-colors text-sm cursor-pointer border border-slate-600"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة المحاولة</span>
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-xl font-medium transition-colors text-sm cursor-pointer border border-transparent"
              >
                <Home className="w-4 h-4" />
                <span>لوحة التحكم</span>
              </button>
            </div>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
