-- CreateTable
CREATE TABLE "coin_flip_rounds" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "commitHash" TEXT NOT NULL,
    "seed" TEXT,
    "result" TEXT,
    "call" TEXT,
    "cause" TEXT,
    "spinnerId" UUID NOT NULL,
    "callerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_flip_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coin_flip_rounds_matchId_idx" ON "coin_flip_rounds"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "coin_flip_rounds_matchId_roundNumber_key" ON "coin_flip_rounds"("matchId", "roundNumber");

-- AddForeignKey
ALTER TABLE "coin_flip_rounds" ADD CONSTRAINT "coin_flip_rounds_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
