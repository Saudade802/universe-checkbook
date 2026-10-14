import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

export const attempts = sqliteTable("check_attempts", {
  userId: text("user_id").notNull(),
  requestId: text("request_id").notNull(),
  successful: integer("successful").notNull(),
  data: text("data"),
  errors: text("errors").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.requestId] }),
  index("attempts_user_created").on(t.userId, t.createdAt),
]);
