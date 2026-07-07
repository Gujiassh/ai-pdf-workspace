from datetime import UTC, datetime


def main() -> None:
    print(f"[worker] startup placeholder ready ts={datetime.now(UTC).isoformat()}")


if __name__ == "__main__":
    main()
