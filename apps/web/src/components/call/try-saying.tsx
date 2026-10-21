import { CircleSlash, MapPin, PackageX, Plane, RotateCcw, SearchX, Sparkles, Undo2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@aura/ui/components/card";
import { cn } from "@aura/ui/lib/utils";

const PROMPTS: { icon: LucideIcon; text: string }[] = [
  { icon: MapPin, text: "Where is my order ORD-101?" },
  { icon: Undo2, text: "I want to return ORD-102." },
  { icon: CircleSlash, text: "Please cancel order 103." },
  { icon: PackageX, text: "My ORD-104 serum arrived damaged." },
  { icon: RotateCcw, text: "I bought this 20 days ago and opened it. Can I return it?" },
  { icon: SearchX, text: "Can you check ORD-999?" },
  { icon: Plane, text: "Can you book me a flight to Goa?" },
];

const ORDER_REF = /(ORD-\d+|\border 103\b)/;

function Highlighted({ text }: { text: string }) {
  return (
    <>
      {text.split(ORDER_REF).map((part, index) =>
        ORDER_REF.test(part) ? (
          <code key={index} className="whitespace-nowrap rounded border bg-muted px-1 py-px font-mono text-[0.8rem]">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

type Props = { live: boolean; onSend: (text: string) => void };

export function TrySaying({ live, onSend }: Props) {
  return (
    <Card className="aura-border ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-pink-400" aria-hidden="true" />
          Try saying
        </CardTitle>
        <CardDescription>
          {live ? "Tap one to send it, or say it out loud." : "Start a call, then tap one to send it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {PROMPTS.map(({ icon: Icon, text }) => (
            <li key={text}>
              <button
                type="button"
                disabled={!live}
                onClick={() => onSend(text)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left text-sm transition-colors",
                  "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background",
                )}
              >
                <span className="grid size-7 flex-none place-items-center rounded-md border bg-muted/50">
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </span>
                <span className="flex-1 leading-relaxed">
                  <Highlighted text={text} />
                </span>
                {live && <span className="whitespace-nowrap text-muted-foreground text-xs">Send →</span>}
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
