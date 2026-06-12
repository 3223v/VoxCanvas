import { Suspense } from 'react';
import DrawPageContent from './DrawPageContent';

export default function DrawPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        加载中...
      </div>
    }>
      <DrawPageContent />
    </Suspense>
  );
}
