import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "border border-zinc-200 bg-white text-zinc-900 shadow-md [--toast-close-button-start:unset] [--toast-close-button-end:0] [--toast-close-button-transform:translate(35%,-35%)]",
          closeButton:
            "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950",
        },
      }}
    />
  );
}
