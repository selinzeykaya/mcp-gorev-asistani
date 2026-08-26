FROM node:20-alpine

WORKDIR /app

# Once sadece bagimliliklari kopyalayip kuruyoruz. Boylece kaynak kod
# degistiginde (asagidaki COPY src) Docker'in katman onbellegi sayesinde
# "npm install" adimi yeniden calismaz - sadece bagimliliklar (package.json)
# degisirse yeniden calisir.
COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

# EXPOSE sadece belgeleme amaclidir (hangi portu dinledigimizi belirtir);
# gercek port haritalama compose.yaml'daki "ports" ile yapilir.
EXPOSE 3000

CMD ["npm", "start"]
