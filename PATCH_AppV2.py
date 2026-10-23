from pathlib import Path
import sys

path = Path("src/AppV2.tsx")
if not path.exists():
    print("BŁĄD: uruchom ten skrypt w katalogu głównym repozytorium System Formy.")
    sys.exit(1)

text = path.read_text(encoding="utf-8")
replacements = [
    (
        "onClick={() => go('/app/trening')}>Rozpocznij trening <Dumbbell size={17}/>",
        "onClick={() => window.location.assign('/app/trening')}>Rozpocznij trening <Dumbbell size={17}/>",
    ),
    (
        "onClick={() => go('/app/trening')}>Rozpocznij trening <ArrowRight size={15}/>",
        "onClick={() => window.location.assign('/app/trening')}>Rozpocznij trening <ArrowRight size={15}/>",
    ),
    (
        "onClick={() => go('/app/trening')}>Wybierz trening <ArrowRight size={15}/>",
        "onClick={() => window.location.assign('/app/trening')}>Wybierz trening <ArrowRight size={15}/>",
    ),
]
changed = 0
for old, new in replacements:
    count = text.count(old)
    if count:
        text = text.replace(old, new)
        changed += count

if changed == 0:
    print("BŁĄD: nie znaleziono oczekiwanych przycisków w src/AppV2.tsx.")
    print("Plik może różnić się od wersji, dla której przygotowano poprawkę.")
    print("Nie wprowadzono zmian.")
    sys.exit(2)

backup = path.with_suffix(".tsx.before-training-fix.bak")
if not backup.exists():
    backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
path.write_text(text, encoding="utf-8")
print(f"OK: zmieniono {changed} przycisk(ów) przejścia do treningu.")
print(f"Kopia zapasowa: {backup}")
print("Teraz uruchom: npm run build")
