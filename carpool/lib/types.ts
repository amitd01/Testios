// API contracts. Every route handler's request/response shape is named here so
// the client and server can't drift (SPEC.md section 4).

export type SlotType = 'pickup' | 'drop';
export type ResponsibilityScope = 'all_children' | 'own_child_only';

export type Parent = { id: string; name: string };
export type Child = { id: string; name: string; parentId: string };

export type Slot = {
  id: string;
  childId: string;
  type: SlotType;
  time: string; // HH:MM
  responsibleParentId: string | null;
  responsibilityScope: ResponsibilityScope | null;
};

export type AdHocEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  type: SlotType;
  childIds: string[];
  responsibleParentId: string | null;
  responsibilityScope: ResponsibilityScope | null;
  createdBy: string;
};

export type Day = { date: string; slots: Slot[]; events: AdHocEvent[] };

/** POST /api/auth/login */
export type LoginRequest = { parentId: string; pin: string };
export type LoginResponse = { success: true };

/** GET /api/schedule/week?start=YYYY-MM-DD */
export type WeekResponse = {
  days: Day[];
  parents: Parent[];
  children: Child[];
  sessionParentId: string;
};

/** PATCH /api/schedule/slot/:id */
export type SlotPatchRequest = {
  time?: string;
  responsibleParentId?: string | null;
  responsibilityScope?: ResponsibilityScope | null;
};
export type SlotPatchResponse = { slot: Slot };

/** GET /api/today */
export type DutyLine = {
  childName: string;
  time: string;
  responsibleParentName: string | null;
  scope: ResponsibilityScope | null;
};
export type TodayResponse = {
  date: string;
  pickup: DutyLine[];
  drop: DutyLine[];
  events: (AdHocEvent & { childNames: string[]; responsibleParentName: string | null })[];
};

/** POST /api/events and PATCH /api/events/:id */
export type EventRequest = {
  title: string;
  date: string;
  time: string;
  type: SlotType;
  childIds: string[];
  responsibleParentId?: string | null;
  responsibilityScope?: ResponsibilityScope | null;
};
export type EventResponse = { event: AdHocEvent };

export type ApiError = { error: string };
