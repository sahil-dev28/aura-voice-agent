"use client";

import { SendHorizontal } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@aura/ui/components/button";

type Props = { typingOnly: boolean; onSend: (text: string) => void; onTyping: () => void };

export function MessageBox({ typingOnly, onSend, onTyping }: Props) {
  const [text, setText] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {typingOnly && (
        <p className="text-muted-foreground text-sm">
          Type your messages here. Aria replies out loud and in writing.
        </p>
      )}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onTyping();
          }}
          placeholder={typingOnly ? "Type your message" : "Or type a message, for example an order ID"}
          aria-label="Message to Aria"
          maxLength={500}
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="lg" variant="outline" disabled={!text.trim()}>
          <SendHorizontal data-icon="inline-start" />
          Send
        </Button>
      </div>
    </form>
  );
}
