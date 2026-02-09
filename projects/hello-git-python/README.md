# hello-git-python

Небольшой «проект-скелет», чтобы показать как создать проект и хранить его в Git.

## Быстрый старт

```bash
cd projects/hello-git-python
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
pip install -r requirements.txt
python app.py --name "Мир"
```

## Что внутри

- `app.py` — минимальный CLI-скрипт (аргументы, код выхода).
- `requirements.txt` — зависимости (сейчас пустой, как шаблон).

## Примечание

Этот пример добавлен **внутрь** текущего репозитория как отдельная папка и уже попадает в Git через коммит.
