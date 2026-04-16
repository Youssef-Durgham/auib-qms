import Image from 'next/image';

export function AuibLogo({ size = 56, withText = false }: { size?: number; withText?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/auib-logo.png"
        alt="AUIB"
        width={size}
        height={size}
        priority
        className="object-contain"
        style={{ width: size, height: 'auto' }}
      />
      {withText && (
        <div className="hidden sm:block">
          <div className="text-sm font-semibold text-[#9C213F] tracking-wide">AUIB</div>
          <div className="text-[11px] text-gray-500">American University in Iraq, Baghdad</div>
        </div>
      )}
    </div>
  );
}
