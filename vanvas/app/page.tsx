export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">
      {/* Decorative top lines */}
      <div className="absolute top-0 left-0 right-0 h-px bg-zinc-200" />
      <div className="absolute top-0 left-0 w-20 h-20 border-t border-l border-zinc-200" />

      <div className="max-w-2xl w-full text-center space-y-8">
        {/* Logo area */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <div className="w-px h-10 bg-zinc-300" />
          <h1 className="text-4xl font-light tracking-[0.3em] text-zinc-800 uppercase">
            VoxCanvas
          </h1>
          <div className="w-px h-10 bg-zinc-300" />
        </div>

        {/* Description */}
        <div className="space-y-4">
          <p className="text-zinc-500 text-lg leading-relaxed max-w-lg mx-auto">
            一个轻量级绘画系统，基于 Roughjs 手绘风格渲染引擎，
            支持画笔、矩形、椭圆等基础绘图工具。
          </p>
        </div>

        {/* Feature grid with line separators */}
        <div className="grid grid-cols-3 divide-x divide-zinc-200 border border-zinc-200 rounded-xl bg-white mt-12">
          <div className="px-4 py-6 text-center">
            <span className="text-2xl">✎</span>
            <p className="text-xs text-zinc-400 mt-2">手绘风格</p>
            <p className="text-[10px] text-zinc-300 mt-0.5">Roughjs 渲染</p>
          </div>
          <div className="px-4 py-6 text-center">
            <span className="text-2xl">▦</span>
            <p className="text-xs text-zinc-400 mt-2">本地存储</p>
            <p className="text-[10px] text-zinc-300 mt-0.5">SQLite 持久化</p>
          </div>
          <div className="px-4 py-6 text-center">
            <span className="text-2xl">⇧</span>
            <p className="text-xs text-zinc-400 mt-2">SVG 导出</p>
            <p className="text-[10px] text-zinc-300 mt-0.5">一键导出分享</p>
          </div>
        </div>

        {/* CTA */}
        <a
          href="/paint"
          className="inline-flex items-center gap-2 mt-12 px-6 py-3 text-sm font-medium
                     rounded-xl bg-zinc-900 text-white hover:bg-zinc-800
                     transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <span className="text-base">✎</span>
          开始绘画
        </a>
      </div>

      {/* Decorative bottom lines */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-zinc-200" />
      <div className="absolute bottom-0 right-0 w-20 h-20 border-b border-r border-zinc-200" />
    </div>
  );
}
