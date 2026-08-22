import secrets
import string
import re

# Default configuration
DEFAULT_LENGTH = 12
CHARACTER_POOL = string.ascii_letters + string.digits + string.punctuation

# Small built‑in dictionary for demo purposes (a subset of common English words)
DICTIONARY_WORDS = {
    "password",
    "admin",
    "welcome",
    "login",
    "qwerty",
    "letmein",
    "monkey",
    "dragon",
    "football",
    "iloveyou",
}

# Common weak patterns (specific sequences that are often used)
COMMON_WEAK_PATTERNS = [
    "12345",
    "abcd",
    "password",
    "qwerty",
    "111111",
    "letmein",
    "12345678",
    "iloveyou",
]

def generate_password(length: int = DEFAULT_LENGTH, characters: str = CHARACTER_POOL) -> str:
    """Generate a random password.

    Args:
        length: Length of the password. Defaults to 12.
        characters: String containing characters to choose from.
    Returns:
        A securely generated password string.
    """
    if length <= 0:
        raise ValueError("Password length must be positive")
    return "".join(secrets.choice(characters) for _ in range(length))

def _has_lower(s: str) -> bool:
    return any(c.islower() for c in s)

def _has_upper(s: str) -> bool:
    return any(c.isupper() for c in s)

def _has_digit(s: str) -> bool:
    return any(c.isdigit() for c in s)

def _has_symbol(s: str) -> bool:
    return any(c in string.punctuation for c in s)

def assess_strength(password: str) -> str:
    """Assess password strength and return a rating.

    The rating is based on length and character‑type diversity:
        * **Weak** – less than 8 characters or only one type of character.
        * **Fair** – at least 8 characters and two‑three types.
        * **Strong** – at least 12 characters and three‑four types.
        * **Ultra‑secure** – 16+ characters and all four types.
    """
    length = len(password)
    types = sum([_has_lower(password), _has_upper(password), _has_digit(password), _has_symbol(password)])
    if length < 8 or types <= 1:
        return "Weak"
    if length >= 16 and types == 4:
        return "Ultra-secure"
    if length >= 12 and types >= 3:
        return "Strong"
    return "Fair"

def contains_weak_pattern(password: str) -> bool:
    """Return True if the password matches any known weak pattern.

    Checks both exact matches against a list of common weak passwords and
    substring matches for simple sequential patterns.
    """
    lowered = password.lower()
    if lowered in COMMON_WEAK_PATTERNS:
        return True
    for pattern in COMMON_WEAK_PATTERNS:
        if pattern in lowered:
            return True
    return False

def contains_dictionary_word(password: str) -> bool:
    """Return True if the password contains a dictionary word.

    The check is case‑insensitive and looks for any whole word from a minimal
    built‑in dictionary. For production use replace this with a full‑scale word
    list.
    """
    lowered = password.lower()
    for word in DICTIONARY_WORDS:
        if word in lowered:
            return True
    return False

def is_password_secure(password: str) -> bool:
    """Convenience wrapper – returns True when the password is considered secure.

    A password is secure when:
        * It does **not** contain a weak pattern.
        * It does **not** contain a dictionary word.
        * Its strength rating is **Strong** or **Ultra-secure**.
    """
    if contains_weak_pattern(password) or contains_dictionary_word(password):
        return False
    return assess_strength(password) in {"Strong", "Ultra-secure"}

if __name__ == "__main__":
    pwd = generate_password()
    print(f"Generated password: {pwd}")
    print(f"Strength: {assess_strength(pwd)}")
    print(f"Weak pattern? {contains_weak_pattern(pwd)}")
    print(f"Dictionary word? {contains_dictionary_word(pwd)}")
    print(f"Overall secure? {is_password_secure(pwd)}")
