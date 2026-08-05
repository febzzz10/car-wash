import { motion, useReducedMotion, useSpring } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "./ui";

export interface StepProps {
  readonly children: ReactNode;
  readonly label: string;
}

export function Step({ children }: StepProps) {
  return <>{children}</>;
}

interface StepMeta {
  readonly label: string;
  readonly key: string;
}

export interface StepperProps {
  readonly canProceed: boolean;
  readonly children: ReactNode;
  readonly currentStep: number;
  readonly finalAction?: ReactNode;
  readonly isSubmitting?: boolean;
  readonly onBack: () => void;
  readonly onNext: () => void;
}

const fadeTransition: ComponentProps<typeof motion.div> = {
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  initial: { opacity: 0, x: 24 },
  transition: {
    opacity: { duration: 0.15 },
    x: { damping: 25, mass: 0.5, stiffness: 300, type: "spring" },
  },
};

export function Stepper({
  canProceed,
  children,
  currentStep,
  finalAction,
  isSubmitting = false,
  onBack,
  onNext,
}: StepperProps) {
  const preferReduced = useReducedMotion();
  const stepElements = useMemo(() => {
    const result: StepMeta[] = [];
    const array = Array.isArray(children) ? children : [children];
    for (let i = 0; i < array.length; i++) {
      const child = array[i] as { readonly props?: { readonly label?: string } } | null | undefined;
      result.push({
        key: `${i}`,
        label: child?.props?.label ?? `Step ${i + 1}`,
      });
    }
    return result;
  }, [children]);

  const clamped = Math.max(0, Math.min(currentStep, stepElements.length - 1));

  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
  const prevIndex = useRef(clamped);
  const rootRef = useRef<HTMLDivElement>(null);

  const measureHeight = useCallback(() => {
    const container = rootRef.current?.querySelector("[data-step-content]");
    if (container instanceof HTMLElement) {
      setContentHeight(container.scrollHeight);
    }
  }, []);

  useEffect(() => {
    measureHeight();
  }, [clamped, measureHeight]);

  const heightSpring = useSpring(contentHeight ?? 0, {
    damping: 25,
    mass: 0.5,
    stiffness: 300,
  });

  useEffect(() => {
    prevIndex.current = clamped;
  }, [clamped]);

  const isLast = clamped === stepElements.length - 1;
  const childArray = Array.isArray(children) ? children : [children];
  const content = childArray[clamped];

  return (
    <div className="wash-stepper" ref={rootRef}>
      <div
        aria-label="New Wash steps"
        className="wash-stepper__indicators"
        role="list"
      >
        {stepElements.map((s, index) => {
          const isCompleted = index < clamped;
          const isActive = index === clamped;
          return (
            <div
              aria-current={isActive ? "step" : undefined}
              aria-label={`Step ${index + 1} of ${stepElements.length}: ${s.label}`}
              className={`wash-stepper__indicator${
                isActive ? " wash-stepper__indicator--active" : ""
              }${isCompleted ? " wash-stepper__indicator--completed" : ""}`}
              key={s.key}
              role="listitem"
            >
              <span className="wash-stepper__indicator-circle">
                {isCompleted ? <Check aria-hidden="true" size={14} /> : index + 1}
              </span>
              <span className="wash-stepper__indicator-label">{s.label}</span>
              {index < stepElements.length - 1 ? (
                <span
                  className={`wash-stepper__connector${
                    isCompleted ? " wash-stepper__connector--completed" : ""
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <motion.div
        className="wash-stepper__content"
        style={{ height: contentHeight !== undefined ? heightSpring : "auto" }}
      >
        <div data-step-content>
          {preferReduced ? (
            content
          ) : (
            <motion.div key={clamped} {...fadeTransition}>
              {content}
            </motion.div>
          )}
        </div>
      </motion.div>
      <div className="wizard-actions">
        <Button
          disabled={clamped === 0}
          onClick={onBack}
          tone="secondary"
          type="button"
        >
          <ChevronLeft size={18} /> Back
        </Button>
        {isLast ? (
          <div className="button-row">{finalAction}</div>
        ) : (
          <Button
            busy={isSubmitting}
            disabled={!canProceed}
            onClick={onNext}
            type="button"
          >
            Continue <ChevronRight size={18} />
          </Button>
        )}
      </div>
    </div>
  );
}
