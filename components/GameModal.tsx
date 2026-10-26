import React from "react";

type Props = {
  label: string;
  title: string;
  description: string;
  icon: string;
  children: React.ReactNode;
  onDismiss?: () => void;
};

export default function GameModal({
  label,
  title,
  description,
  icon,
  children,
  onDismiss,
}: Props) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const descriptionId = React.useId();

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="game-modal"
      aria-label={label}
      aria-describedby={descriptionId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((control) => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss?.();
      }}
    >
      <span className="modal-icon" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      <p className="muted" id={descriptionId}>
        {description}
      </p>
      {children}
    </dialog>
  );
}
