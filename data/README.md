# Dataset

Este projeto usa apenas o arquivo `anime.csv` do dataset **Anime Recommendations Database**
(Kaggle, autor CooperUnion). O arquivo `rating.csv` (~1.1 GB) não é usado e não deve ser
copiado para esta pasta.

## Caminho A — download manual (padrão)

1. Crie uma conta no Kaggle e acesse:
   https://www.kaggle.com/datasets/CooperUnion/anime-recommendations-database
2. Clique em *Download* e extraia o zip.
3. Copie `anime.csv` para `./data/anime.csv` na raiz do repositório.

## Caminho B — Kaggle CLI (opcional)

```bash
# requer ~/.kaggle/kaggle.json com credenciais da conta
pip install kaggle
kaggle datasets download -d CooperUnion/anime-recommendations-database -p ./data --unzip
rm -f ./data/rating.csv
```

O arquivo `anime.csv` é ignorado pelo git (`data/*.csv`).
