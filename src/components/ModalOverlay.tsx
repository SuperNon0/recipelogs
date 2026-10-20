"use client";

/** Fenêtre modale style « iOS sheet » (depuis le bas sur mobile, centrée sur desktop). */
export function ModalOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg p-5 flex flex-col gap-3 fl-scroll"
        style={{
          background: "var(--card)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          maxHeight: "90vh",
          overflowY: "auto",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 4,
            background: "var(--border)",
            borderRadius: 2,
            alignSelf: "center",
          }}
        />
        {children}
      </div>
    </div>
  );
}
