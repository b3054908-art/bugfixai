"""Detect the primary programming language used by a project workspace."""
import os


_LANGUAGE_BY_EXTENSION = {
	".js": "JavaScript",
	".jsx": "JavaScript",
	".ts": "TypeScript",
	".tsx": "TypeScript",
	".py": "Python",
	".go": "Go",
	".rs": "Rust",
}
_LANGUAGES = ("Python", "TypeScript", "JavaScript", "Go", "Rust")
_IGNORED_DIRECTORIES = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build"}


async def detect_language(root: str) -> str:
	counts = {language: 0 for language in _LANGUAGES}

	for current_root, directories, filenames in os.walk(root):
		directories[:] = [directory for directory in directories if directory not in _IGNORED_DIRECTORIES]
		for filename in filenames:
			language = _LANGUAGE_BY_EXTENSION.get(os.path.splitext(filename)[1].lower())
			if language:
				counts[language] += 1

	if not any(counts.values()):
		return "Unknown"
	return max(counts, key=counts.get)
