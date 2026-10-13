import type { ImageSourcePropType } from "react-native";

export type FoodDish = {
  id: string;
  nameKey: string;
  detailKey: string;
  price: number;
  image: ImageSourcePropType;
};

export type FoodPlace = {
  id: string;
  name: string;
  address: string;
  phone: string;
  image: ImageSourcePropType;
  dishes: FoodDish[];
};

export const FOOD_PLACES: FoodPlace[] = [
  {
    id: "shahrixon",
    name: "Shahrixon Fastfood",
    address: "Shahrixon shahri, Asaka ko'chasi, 6-uy",
    phone: "+998 (90) 222-33-77",
    image: require("../../assets/food/food-cover.jpg"),
    dishes: [
      {
        id: "lavash",
        nameKey: "food.lavash",
        detailKey: "food.lavash_d",
        price: 28000,
        image: require("../../assets/food/food-lavash.jpg"),
      },
      {
        id: "burger",
        nameKey: "food.burger",
        detailKey: "food.burger_d",
        price: 35000,
        image: require("../../assets/food/food-burger.jpg"),
      },
      {
        id: "donar",
        nameKey: "food.donar",
        detailKey: "food.donar_d",
        price: 32000,
        image: require("../../assets/food/food-donar.jpg"),
      },
      {
        id: "fries",
        nameKey: "food.fries",
        detailKey: "food.fries_d",
        price: 15000,
        image: require("../../assets/food/food-fries.jpg"),
      },
      {
        id: "hotdog",
        nameKey: "food.hotdog",
        detailKey: "food.hotdog_d",
        price: 18000,
        image: require("../../assets/food/food-hotdog.jpg"),
      },
    ],
  },
  {
    id: "andijon",
    name: "Andijon taomomasi",
    address: "Andijon shahri, Bobur shoh ko'chasi, 12-uy",
    phone: "+998 (91) 333-44-88",
    image: require("../../assets/food/andijon-cover.jpg"),
    dishes: [
      {
        id: "andijon-osh",
        nameKey: "food.osh",
        detailKey: "food.osh_d",
        price: 25000,
        image: require("../../assets/food/andijon-osh.jpg"),
      },
      {
        id: "andijon-somsa",
        nameKey: "food.somsa",
        detailKey: "food.somsa_d",
        price: 8000,
        image: require("../../assets/food/andijon-somsa.jpg"),
      },
      {
        id: "andijon-shashlik",
        nameKey: "food.shashlik",
        detailKey: "food.shashlik_d",
        price: 35000,
        image: require("../../assets/food/andijon-shashlik.jpg"),
      },
      {
        id: "andijon-lagmon",
        nameKey: "food.lagmon",
        detailKey: "food.lagmon_d",
        price: 28000,
        image: require("../../assets/food/andijon-lagmon.jpg"),
      },
      {
        id: "andijon-manti",
        nameKey: "food.manti",
        detailKey: "food.manti_d",
        price: 22000,
        image: require("../../assets/food/andijon-manti.jpg"),
      },
    ],
  },
];
