const HOLD_REPEAT_NUMERATOR_MILLISECONDS = 250;

function isDisabled(button) {
  return button.disabled || button.getAttribute("aria-disabled") === "true";
}

function repeatInterval(repeatCount) {
  return HOLD_REPEAT_NUMERATOR_MILLISECONDS / (Math.max(1, repeatCount) ** (2 / 3));
}

export function installHoldButton(button, action) {
  let timerId = null;
  let repeatCount = 0;
  let activePointerId = null;

  const stopHold = () => {
    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    repeatCount = 0;
    activePointerId = null;
    button.classList.remove("is-holding");
  };
  const scheduleRepeat = () => {
    timerId = window.setTimeout(() => {
      timerId = null;
      if (activePointerId === null || !action() || isDisabled(button)) {
        stopHold();
        return;
      }
      repeatCount += 1;
      scheduleRepeat();
    }, repeatInterval(repeatCount));
  };

  button.addEventListener("pointerdown", (event) => {
    if (
      activePointerId !== null || isDisabled(button) ||
      !event.isPrimary || event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    stopHold();
    activePointerId = event.pointerId;
    button.classList.add("is-holding");
    try {
      button.setPointerCapture(event.pointerId);
    } catch (_error) {
      // Pointer capture is best-effort.
    }
    if (!action() || isDisabled(button)) {
      stopHold();
      return;
    }
    repeatCount = 1;
    scheduleRepeat();
  });
  const stopActivePointer = (event) => {
    if (event.pointerId === activePointerId) {
      stopHold();
    }
  };
  window.addEventListener("pointerup", stopActivePointer);
  window.addEventListener("pointercancel", stopActivePointer);
  button.addEventListener("lostpointercapture", stopActivePointer);
  window.addEventListener("blur", stopHold);
  button.addEventListener("click", (event) => {
    if (event.detail > 0) {
      event.preventDefault();
      return;
    }
    if (!isDisabled(button)) {
      action();
    }
  });
}
