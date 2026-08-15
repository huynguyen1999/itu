ALTER TABLE "Notification" ALTER COLUMN "reminderId" DROP NOT NULL;

ALTER TABLE "Notification" ADD COLUMN "habitReminderDeliveryId" TEXT;

CREATE UNIQUE INDEX "Notification_habitReminderDeliveryId_key" ON "Notification"("habitReminderDeliveryId");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_habitReminderDeliveryId_fkey"
FOREIGN KEY ("habitReminderDeliveryId") REFERENCES "HabitReminderDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
