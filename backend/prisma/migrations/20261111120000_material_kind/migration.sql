-- Materialart: FILAMENT (Gramm, wird gedruckt) oder PART (Zukaufteil wie Schrauben, Magnete: Stück, je verkaufter Einheit fest)
ALTER TABLE "Material" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FILAMENT';
