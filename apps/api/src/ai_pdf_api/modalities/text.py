def estimate_token_count(text: str) -> int:
    count = 0
    in_word = False
    for character in text:
        if character.isspace():
            in_word = False
            continue
        if "\u3400" <= character <= "\u9fff":
            count += 1
            in_word = False
        elif character.isalnum():
            if not in_word:
                count += 1
            in_word = True
        else:
            count += 1
            in_word = False
    return max(1, count)
